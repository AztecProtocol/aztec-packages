/** Minimal WASI-threads host plus the standard msgpack bbapi cbind. */

import { Decoder, Encoder } from 'msgpackr';
import { buildMainImports } from './wasi.js';

export interface MainOptions {
  module: WebAssembly.Module;
  threads: number;
  memory?: { initial?: number; maximum?: number };
  logger?: (msg: string) => void;
}

export interface ChonkStep {
  functionName: string;
  bytecode: Uint8Array;
  witness: Uint8Array;
  vk: Uint8Array;
}

export class BarretenbergMain {
  private static readonly MSGPACK_SCRATCH_SIZE = 8 * 1024 * 1024;

  private memory!: WebAssembly.Memory;
  private instance!: WebAssembly.Instance;
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextThreadId = 1;
  private logger: (msg: string) => void = () => {};
  private msgpackInputScratch = 0;
  private msgpackOutputScratch = 0;
  private readonly encoder = new Encoder({ useRecords: false });
  private readonly decoder = new Decoder({ useRecords: false });

  static async create(opts: MainOptions): Promise<BarretenbergMain> {
    const bb = new BarretenbergMain();
    await bb.init(opts);
    return bb;
  }

  private async init(opts: MainOptions): Promise<void> {
    this.logger = opts.logger ?? (() => {});
    const initial = opts.memory?.initial ?? 35;
    const maximum = opts.memory?.maximum ?? 65536;

    if (typeof SharedArrayBuffer === 'undefined' || !(globalThis as any).crossOriginIsolated) {
      throw new Error(
        'wasm-bench requires SharedArrayBuffer + crossOriginIsolated. Serve via serve-bench.mjs which sets COOP/COEP headers.',
      );
    }

    this.memory = new WebAssembly.Memory({ initial, maximum, shared: true });
    this.logger(
      `Initializing bb wasm: initial memory ${initial} pages ${(initial * 64 / 1024).toFixed(2)}MiB; ` +
        `max memory: ${maximum} pages, ${(maximum * 64 / 1024).toFixed(2)}MiB; ` +
        `threads: ${opts.threads}; shared memory: true`,
    );

    const imports = buildMainImports(
      {
        memory: this.memory,
        getMemoryBytes: () => new Uint8Array(this.memory.buffer),
        logger: this.logger,
      },
      {
        onThreadSpawn: (arg) => {
          const tid = this.nextThreadId++;
          if (this.workers.length === 0) {
            this.logger('PANIC: thread-spawn requested but no workers');
            return -1;
          }
          const w = this.workers[this.nextWorker++ % this.workers.length];
          w.postMessage({ kind: 'start', tid, arg });
          return tid;
        },
        reportedThreads: opts.threads,
      },
    );
    this.instance = await WebAssembly.instantiate(opts.module, imports as any);
    this.call('_initialize');
    this.msgpackInputScratch = this.call('bbmalloc', BarretenbergMain.MSGPACK_SCRATCH_SIZE);
    this.msgpackOutputScratch = this.call('bbmalloc', BarretenbergMain.MSGPACK_SCRATCH_SIZE);

    if (opts.threads > 1) {
      this.logger(`Creating ${opts.threads - 1} child worker threads for ${opts.threads} total wasm threads`);
      this.workers = await Promise.all(
        Array.from({ length: opts.threads - 1 }, () => this.spawnWorker(opts.module, this.memory)),
      );
    }
  }

  private async spawnWorker(module: WebAssembly.Module, memory: WebAssembly.Memory): Promise<Worker> {
    const w = new Worker(new URL('./worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<{ kind: string; msg?: string }>) => {
      if (e.data?.kind === 'log' && typeof e.data.msg === 'string') this.logger(e.data.msg);
      else if (e.data?.kind === 'error' && typeof e.data.msg === 'string') this.logger(`worker error: ${e.data.msg}`);
    };
    const SPAWN_TIMEOUT_MS = 30_000;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        try { w.terminate(); } catch { /* already dead */ }
        reject(err);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve();
      };
      const onReady = (e: MessageEvent<{ kind: string }>) => {
        if (e.data?.kind === 'ready') {
          w.removeEventListener('message', onReady);
          succeed();
        }
      };
      const onError = (err: ErrorEvent) => {
        fail(err.error ?? new Error(`worker init failed: ${err.message ?? 'unknown'}`));
      };
      w.addEventListener('message', onReady);
      w.addEventListener('error', onError);
      const deadline = setTimeout(() => {
        fail(new Error(`worker init timed out after ${SPAWN_TIMEOUT_MS}ms (no 'ready' message)`));
      }, SPAWN_TIMEOUT_MS);
      w.postMessage({ kind: 'init', module, memory });
    });
    return w;
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    if (this.msgpackInputScratch) {
      this.call('bbfree', this.msgpackInputScratch);
      this.msgpackInputScratch = 0;
    }
    if (this.msgpackOutputScratch) {
      this.call('bbfree', this.msgpackOutputScratch);
      this.msgpackOutputScratch = 0;
    }
  }

  private call(name: string, ...args: number[]): number {
    const fn = (this.instance.exports as any)[name];
    if (typeof fn !== 'function') throw new Error(`wasm export ${name} not found`);
    return (fn(...args) >>> 0);
  }

  private cbindCall(name: string, inputBuffer: Uint8Array): Uint8Array {
    const inputPtr = inputBuffer.length > BarretenbergMain.MSGPACK_SCRATCH_SIZE
      ? this.call('bbmalloc', inputBuffer.length)
      : this.msgpackInputScratch;
    new Uint8Array(this.memory.buffer).set(inputBuffer, inputPtr);

    const metadataSize = 8;
    const outputPtrLocation = this.msgpackOutputScratch;
    const outputSizeLocation = this.msgpackOutputScratch + 4;
    const scratchDataPtr = this.msgpackOutputScratch + metadataSize;
    const scratchDataSize = BarretenbergMain.MSGPACK_SCRATCH_SIZE - metadataSize;

    let view = new DataView(this.memory.buffer);
    view.setUint32(outputPtrLocation, scratchDataPtr, true);
    view.setUint32(outputSizeLocation, scratchDataSize, true);

    try {
      this.call(name, inputPtr, inputBuffer.length, outputPtrLocation, outputSizeLocation);
    } finally {
      if (inputPtr !== this.msgpackInputScratch) this.call('bbfree', inputPtr);
    }

    view = new DataView(this.memory.buffer);
    const outputDataPtr = view.getUint32(outputPtrLocation, true);
    const outputSize = view.getUint32(outputSizeLocation, true);
    const out = new Uint8Array(this.memory.buffer, outputDataPtr, outputSize).slice();
    if (outputDataPtr !== scratchDataPtr) this.call('bbfree', outputDataPtr);
    return out;
  }

  private bbapi<T = any>(command: string, payload: Record<string, unknown>): T {
    const request = this.encoder.pack([[command, payload]]);
    const [variantName, result] = this.decoder.unpack(this.cbindCall('bbapi', request)) as [string, any];
    if (variantName === 'ErrorResponse') {
      throw new Error(result?.message ?? 'unknown bbapi error');
    }
    const expected = `${command}Response`;
    if (variantName !== expected) {
      throw new Error(`bbapi ${command}: expected ${expected}, got ${variantName}`);
    }
    return result as T;
  }

  srsInitSrs(pointsBuf: Uint8Array, numPoints: number, g2Point: Uint8Array): void {
    this.bbapi('SrsInitSrs', { points_buf: pointsBuf, num_points: numPoints, g2_point: g2Point });
  }

  srsInitGrumpkinSrs(pointsBuf: Uint8Array, numPoints: number): void {
    this.bbapi('SrsInitGrumpkinSrs', { points_buf: pointsBuf, num_points: numPoints });
  }

  chonkSetup(steps: ChonkStep[]): number {
    this.bbapi('ChonkStart', { num_circuits: steps.length });
    for (const step of steps) {
      this.bbapi('ChonkLoad', {
        circuit: {
          name: step.functionName,
          bytecode: step.bytecode,
          verification_key: step.vk,
        },
      });
      this.bbapi('ChonkAccumulate', { witness: step.witness });
    }
    return steps.length;
  }

  chonkProve(): number {
    const { proof } = this.bbapi<{ proof: Record<string, Uint8Array[]> }>('ChonkProve', {});
    return Object.values(proof).reduce((sum, fields) => sum + fields.length, 0);
  }

  benchEnableTrace(enable: boolean): void {
    this.bbapi('BenchEnableTrace', { enable });
  }

  benchDump(opts: { reset: boolean; includeTrace: boolean }): { aggregate_json: string; trace_events_json: string } {
    return this.bbapi('BenchDump', { reset: opts.reset, include_trace: opts.includeTrace });
  }
}
