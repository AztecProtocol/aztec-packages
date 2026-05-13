import {
  compute_bn254_msm_with_context,
  compute_bn254_msm_cached,
  compute_bn254_msm_batch_affine,
} from '../msm.js';
import { GpuContext } from '../cuzk/gpu_context.js';
import { CachedBases, precompute_bn254_bases } from '../cuzk/cached_bases.js';
import {
  ERR_GENERIC,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_ERROR_CODE,
  SLOT_N,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_STATE,
  STATE_DONE,
  STATE_ERROR,
} from './protocol.js';

/**
 * Main-thread host for the WebGPU MSM bridge. Owns a single
 * `GpuContext` (and therefore one GPUDevice + one pipeline cache) and
 * one optional `CachedBases` warm-cache derived from the SRS the
 * WASM-side publishes via `bb_publish_srs_bn254`.
 *
 * Lifecycle:
 *   1. Construct one per worker, sharing the same control SAB the
 *      worker stub was constructed with.
 *   2. Pass the WASM module's `WebAssembly.Memory` once it's been
 *      instantiated, so the host can `new Uint8Array(memory.buffer, ...)`
 *      directly against shared memory.
 *   3. Wire `worker.onmessage = e => host.handleMessage(e.data)`. The
 *      worker_stub posts the string `'msm_request'` every time the
 *      WASM-side import is called.
 *
 * Concurrency: one MSM in flight at a time. The bridge protocol is
 * single-slot, mirroring the WASM hot path which always issues one
 * MSM at a time (Pippenger is a per-call function, never reentrant).
 */
export class WebGpuMsmHost {
  private readonly ctrl: Int32Array;
  private wasmMemory: WebAssembly.Memory | null = null;
  private context: GpuContext | null = null;
  private cached: CachedBases | null = null;
  private destroyed = false;

  // If a request arrives before `setWasmMemory` is called, we can't
  // service it. Used by the test harness; production order is always
  // memory-then-message.
  private pendingErrorMessage: string | null = null;

  constructor(ctrl_sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(ctrl_sab);
  }

  public setWasmMemory(memory: WebAssembly.Memory): void {
    this.wasmMemory = memory;
  }

  /**
   * Routine for `worker.onmessage`. The worker posts the string
   * `'msm_request'`; we dispatch on the current OPCODE slot.
   */
  public async handleMessage(msg: unknown): Promise<void> {
    if (msg !== 'msm_request' || this.destroyed) return;
    try {
      const op = Atomics.load(this.ctrl, SLOT_OPCODE);
      if (op === OP_MSM) {
        await this.runMsm();
      } else if (op === OP_PUBLISH_SRS) {
        await this.runPublishSrs();
      } else {
        throw new Error(`WebGPU bridge: unknown opcode ${op}`);
      }
      Atomics.store(this.ctrl, SLOT_STATE, STATE_DONE);
    } catch (err) {
      console.error('WebGPU MSM bridge error:', err);
      Atomics.store(this.ctrl, SLOT_ERROR_CODE, ERR_GENERIC);
      Atomics.store(this.ctrl, SLOT_STATE, STATE_ERROR);
      this.pendingErrorMessage =
        err instanceof Error ? err.message : String(err);
    } finally {
      Atomics.notify(this.ctrl, SLOT_STATE, 1);
    }
  }

  /** Return and clear the message of the most-recent failed request. */
  public getLastErrorMessage(): string | null {
    const m = this.pendingErrorMessage;
    this.pendingErrorMessage = null;
    return m;
  }

  public async destroy(): Promise<void> {
    this.destroyed = true;
    // GpuContext owns a GPUDevice; calling device.destroy() lets the
    // driver reclaim shader pipelines and persistent buffers
    // immediately, instead of waiting for GC. Safe to call even if
    // already destroyed (idempotent in the WebGPU spec).
    if (this.context) {
      this.context.device.destroy();
      this.context = null;
    }
    this.cached = null;
  }

  private async getOrCreateContext(): Promise<GpuContext> {
    if (this.context === null) {
      this.context = await GpuContext.create();
    }
    return this.context;
  }

  private wasmSliceCopy(ptr: number, byteLength: number): Buffer {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    // Copy out of WASM memory rather than holding a view. The WASM
    // build may grow its memory between request and result, which
    // detaches existing views and would crash the WebGPU upload.
    const src = new Uint8Array(this.wasmMemory.buffer, ptr, byteLength);
    return Buffer.from(src.slice());
  }

  private async runPublishSrs(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    const ptr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    if (n === 0) {
      return;
    }
    const ctx = await this.getOrCreateContext();
    const pointsBuffer = this.wasmSliceCopy(ptr, n * 64);
    this.cached = await precompute_bn254_bases(ctx, pointsBuffer);
  }

  private async runMsm(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    const pointsPtr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    const scalarsPtr = Atomics.load(this.ctrl, SLOT_SCALARS_PTR);
    const resultPtr = Atomics.load(this.ctrl, SLOT_RESULT_PTR);

    const ctx = await this.getOrCreateContext();
    const scalarsBuffer = this.wasmSliceCopy(scalarsPtr, n * 32);

    // Pick warm-vs-cold path. The cached path requires the request's
    // points span to match the SRS we published earlier; if not (e.g.
    // a commit against an unusual point set), fall back to cold.
    let result: { x: bigint; y: bigint };
    if (this.cached && this.cached.input_size === n) {
      result = await compute_bn254_msm_batch_affine(
        ctx,
        this.cached,
        scalarsBuffer,
        /* log_result */ false,
      );
    } else if (this.cached && this.cached.input_size >= n) {
      // SRS is larger than this MSM — slice and use cold path. We
      // can't slice a `CachedBases` cheaply, so we cold-upload the
      // prefix. Acceptable in the steady state because most chonk
      // commits hit n === SRS-size exactly.
      const pointsBuffer = this.wasmSliceCopy(pointsPtr, n * 64);
      result = await compute_bn254_msm_with_context(
        ctx,
        pointsBuffer,
        scalarsBuffer,
        /* log_result */ false,
      );
    } else {
      // No SRS published, or this MSM is bigger than published SRS.
      // Cold path.
      const pointsBuffer = this.wasmSliceCopy(pointsPtr, n * 64);
      result = await compute_bn254_msm_with_context(
        ctx,
        pointsBuffer,
        scalarsBuffer,
        /* log_result */ false,
      );
    }

    this.writeAffineResultLE(resultPtr, result);
  }

  private writeAffineResultLE(
    resultPtr: number,
    result: { x: bigint; y: bigint },
  ): void {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    const out = new Uint8Array(this.wasmMemory.buffer, resultPtr, 64);
    writeBigIntLE(out, 0, result.x, 32);
    writeBigIntLE(out, 32, result.y, 32);
  }
}

function writeBigIntLE(
  out: Uint8Array,
  offset: number,
  v: bigint,
  byteLength: number,
): void {
  let cur = v;
  const mask = 0xffn;
  for (let i = 0; i < byteLength; i++) {
    out[offset + i] = Number(cur & mask);
    cur >>= 8n;
  }
}

export { writeBigIntLE };
