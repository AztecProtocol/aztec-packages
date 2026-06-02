import { randomBytes } from '../../random/index.js';

/**
 * Base implementation of BarretenbergWasm.
 * Contains code that is common to the "main thread" implementation and the "child thread" implementation.
 */
export class BarretenbergWasmBase {
  protected memory!: WebAssembly.Memory;
  protected instance!: WebAssembly.Instance;
  protected logger: (msg: string) => void = () => {};

  // Extra entries to merge into the `env` import object. The WebGPU MSM
  // bridge uses this to inject `bb_external_msm_bn254` and
  // `bb_publish_srs_bn254` into a `BBERG_WEBGPU_MSM_HOOK`-built WASM
  // without the base class needing to know about WebGPU. Set this
  // before calling `init` / `WebAssembly.instantiate`.
  //
  // Default-initialized with the BBERG_WEBGPU_MSM_HOOK stubs so any
  // wasm instance instantiated from a hook-enabled WASM links cleanly,
  // regardless of which factory path created it (sync, async-direct,
  // worker, pthread). Each path can override via setExtraEnvImports
  // (e.g. the browser bridge swaps in the real implementations).
  protected extraEnvImports: Record<string, unknown> = {
    /* eslint-disable @typescript-eslint/naming-convention */
    bb_external_msm_bn254: () => {
      throw new Error(
        'bb_external_msm_bn254 invoked without a WebGPU bridge installed. ' +
          'Call setupWebGpuMsmBridge() (browser) or rebuild WASM without BBERG_WEBGPU_MSM_HOOK.',
      );
    },
    bb_external_batch_msm_bn254: (
      _batch_count: number,
      _descriptors_ptr: number,
      _scalars_base: number,
      _results_base: number,
      _meta_base: number,
      _labels_packed: number,
    ) => {
      throw new Error(
        'bb_external_batch_msm_bn254 invoked without a WebGPU bridge installed. ' +
          'Call setupWebGpuMsmBridge() (browser) or rebuild WASM without BBERG_WEBGPU_MSM_HOOK.',
      );
    },
    bb_publish_srs_bn254: () => {
      // No-op. The bridge overrides this when present.
    },
    /* eslint-enable @typescript-eslint/naming-convention */
  };

  public setExtraEnvImports(imports: Record<string, unknown>): void {
    this.extraEnvImports = { ...this.extraEnvImports, ...imports };
  }

  protected getImportObj(memory: WebAssembly.Memory) {
    /* eslint-disable camelcase */
    const importObj = {
      // We need to implement a part of the wasi api:
      // https://github.com/WebAssembly/WASI/blob/main/phases/snapshot/docs.md
      // We literally only need to support random_get, everything else is noop implementated in barretenberg.wasm.
      wasi_snapshot_preview1: {
        random_get: (out: any, length: number) => {
          out = out >>> 0;
          const randomData = randomBytes(length);
          const mem = this.getMemory();
          mem.set(randomData, out);
        },
        clock_time_get: (a1: number, a2: number, out: number) => {
          out = out >>> 0;
          // High-resolution wall clock: `performance.timeOrigin + performance.now()` (ns), rather
          // than `Date.now()` which is integer-millisecond. Sub-ms resolution matters for the
          // phase-level BB_BENCH trace — with ms precision every sub-millisecond scope records
          // dur=0. `timeOrigin` is a per-thread constant, so it cancels in any duration (end−start
          // on one thread), giving exact sub-µs durations; absolute values stay ≈ Date.now() and
          // coherent across workers (each worker's timeOrigin+now ≈ the same absolute wall time).
          // The split keeps the varying `now()` part at full precision (timeOrigin*1e6 alone would
          // lose low bits to the double mantissa). `performance` is available in browser workers and
          // Node alike.
          const ts = BigInt(Math.round(performance.timeOrigin * 1e6)) + BigInt(Math.round(performance.now() * 1e6));
          const view = new DataView(this.getMemory().buffer);
          view.setBigUint64(out, ts, true);
        },
        proc_exit: () => {
          this.logger('PANIC: proc_exit was called.');
          throw new Error();
        },
      },

      // These are functions implementations for imports we've defined are needed.
      // The native C++ build defines these in a module called "env". We must implement TypeScript versions here.
      env: {
        /**
         * The 'info' call we use for logging in C++, calls this under the hood.
         * The native code will just print to std:err (to avoid std::cout which is used for IPC).
         * Here we just emit the log line for the client to decide what to do with.
         */
        logstr: (addr: number) => {
          const str = this.stringFromAddress(addr);
          const m = this.getMemory();
          const str2 = `${str} (mem: ${(m.length / (1024 * 1024)).toFixed(2)}MiB)`;
          this.logger(str2);
        },

        throw_or_abort_impl: (addr: number) => {
          const str = this.stringFromAddress(addr);
          throw new Error(str);
        },

        memory,

        // Merge in caller-provided extra env imports (e.g. the WebGPU
        // MSM bridge's `bb_external_msm_bn254`). Listed last so the
        // built-in entries take precedence on name collision.
        ...this.extraEnvImports,
      },
    };
    /* eslint-enable camelcase */

    return importObj;
  }

  public exports(): any {
    return this.instance.exports;
  }

  /**
   * When returning values from the WASM, use >>> operator to convert signed representation to unsigned representation.
   */
  public call(name: string, ...args: any) {
    if (!this.exports()[name]) {
      throw new Error(`WASM function ${name} not found.`);
    }
    try {
      return this.exports()[name](...args) >>> 0;
    } catch (err: any) {
      const message = `WASM function ${name} aborted, error: ${err}`;
      this.logger(message);
      this.logger(err.stack);
      throw err;
    }
  }

  public memSize() {
    return this.getMemory().length;
  }

  /**
   * Returns a copy of the data, not a view.
   */
  public getMemorySlice(start: number, end: number) {
    return this.getMemory().subarray(start, end).slice();
  }

  public writeMemory(offset: number, arr: Uint8Array) {
    const mem = this.getMemory();
    mem.set(arr, offset);
  }

  public getMemory() {
    return new Uint8Array(this.memory.buffer);
  }

  // The raw WebAssembly.Memory backing this instance. Used by the WebGPU
  // MSM bridge to share the WASM heap with the main-thread host (which
  // reads request payloads — points + scalars — directly from this memory
  // via a Uint8Array view on the SAB-backed buffer). Returns the
  // SAB-backed WebAssembly.Memory object so the host can postMessage it
  // back through `webgpu-wasm-memory`.
  public publishWebGpuMemory(): void {
    if (typeof self !== 'undefined' && this.memory) {
      self.postMessage({ kind: 'webgpu-wasm-memory', memory: this.memory });
    }
  }

  // PRIVATE METHODS

  private stringFromAddress(addr: number) {
    addr = addr >>> 0;
    const m = this.getMemory();
    let i = addr;
    for (; m[i] !== 0; ++i);
    const textDecoder = new TextDecoder('ascii');
    return textDecoder.decode(m.slice(addr, i));
  }
}
