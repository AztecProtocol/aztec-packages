import { MsmV2, MsmV2Pool } from '../msm_v2.js';
import { get_device } from '../cuzk/gpu.js';
import {
  ERR_GENERIC,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_C,
  SLOT_ERROR_CODE,
  SLOT_N,
  SLOT_NUM_WINDOWS,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_STATE,
  STATE_DONE,
  STATE_ERROR,
} from './protocol.js';

// Non-SRS-sized MSM instances held besides the pinned SRS-sized one. Per-`n`
// instances are cheap to build (they bind the shared pool — no point upload),
// so a small cap is enough; bump it only if a proof interleaves many sizes.
const MSM_LRU_CAP = 1;

/**
 * Main-thread host for the WebGPU MSM bridge. Owns one `GPUDevice`, one shared
 * `MsmV2Pool` (the SRS uploaded + Montgomery-converted on the GPU once), and a
 * small cache of per-size `MsmV2` instances bound to that pool.
 *
 * Lifecycle:
 *   1. Construct one per worker, sharing the same control SAB the worker stub
 *      was constructed with.
 *   2. Pass the WASM module's `WebAssembly.Memory` once it's been instantiated,
 *      so the host can `new Uint8Array(memory.buffer, ...)` against shared
 *      memory.
 *   3. Wire `worker.onmessage = e => host.handleMessage(e.data)`. The worker
 *      stub posts the string `'msm_request'` every time a WASM-side import is
 *      called.
 *
 * The first `OP_PUBLISH_SRS` builds the shared point pool — the SRS coordinates
 * are streamed to the GPU and converted to Montgomery form exactly once. Every
 * subsequent `OP_MSM` reuses a prefix of that pool; only the scalars are copied
 * in per call.
 *
 * Concurrency: one MSM in flight at a time. The bridge protocol is single-slot,
 * mirroring the WASM hot path which always issues one MSM at a time.
 */
export class WebGpuMsmHost {
  private readonly ctrl: Int32Array;
  private wasmMemory: WebAssembly.Memory | null = null;
  private device: GPUDevice | null = null;
  private destroyed = false;

  // The one shared SRS point pool, plus the per-size MSM instances bound to it.
  // `srsMsm` (n === srsN) is the hot path and is pinned; other sizes rotate
  // through `lru` (insertion order == LRU order).
  private pool: MsmV2Pool | null = null;
  private srsN = 0;
  private srsMsm: MsmV2 | null = null;
  private lru = new Map<number, MsmV2>();

  // If a request arrives before `setWasmMemory` is called, we can't service it.
  // Used by the test harness; production order is always memory-then-message.
  private pendingErrorMessage: string | null = null;

  constructor(ctrl_sab: SharedArrayBuffer) {
    this.ctrl = new Int32Array(ctrl_sab);
  }

  public setWasmMemory(memory: WebAssembly.Memory): void {
    this.wasmMemory = memory;
  }

  /**
   * Routine for `worker.onmessage`. The worker posts the string `'msm_request'`;
   * we dispatch on the current OPCODE slot.
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
      this.pendingErrorMessage = err instanceof Error ? err.message : String(err);
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
    try {
      this.srsMsm?.destroy();
    } catch {
      /* idempotent */
    }
    for (const m of this.lru.values()) {
      try {
        m.destroy();
      } catch {
        /* idempotent */
      }
    }
    try {
      this.pool?.destroy();
    } catch {
      /* idempotent */
    }
    this.srsMsm = null;
    this.lru.clear();
    this.pool = null;
    // GPUDevice.destroy() lets the driver reclaim every shader pipeline and
    // buffer immediately instead of waiting for GC. Idempotent per the spec.
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }

  private async getDevice(): Promise<GPUDevice> {
    if (this.device === null) {
      this.device = await get_device();
    }
    return this.device;
  }

  private wasmSliceCopy(ptr: number, byteLength: number): Uint8Array {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    // Copy out of WASM memory rather than holding a view. The WASM build may
    // grow its memory between request and result, which detaches existing
    // views and would crash the WebGPU upload.
    return new Uint8Array(this.wasmMemory.buffer, ptr, byteLength).slice();
  }

  /**
   * `OP_PUBLISH_SRS` — stream the SRS to the GPU once. Builds the shared
   * `MsmV2Pool` (raw upload + GPU Montgomery conversion); any previously cached
   * instances/pool are torn down first.
   */
  private async runPublishSrs(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    if (n === 0) return;
    const ptr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    const srsBytes = this.wasmSliceCopy(ptr, n * 64);
    const device = await this.getDevice();

    this.srsMsm?.destroy();
    this.srsMsm = null;
    for (const m of this.lru.values()) m.destroy();
    this.lru.clear();
    this.pool?.destroy();

    this.pool = await MsmV2Pool.create(device, srsBytes);
    this.srsN = n;
  }

  /**
   * Get (or build) an `MsmV2` for `n` points, bound to the shared pool. The
   * SRS-sized instance is pinned; others rotate through a small LRU.
   */
  private async getOrCreateMsm(n: number): Promise<MsmV2> {
    const device = await this.getDevice();
    const pool = this.pool!;
    if (n === this.srsN) {
      if (this.srsMsm === null) {
        this.srsMsm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false });
      }
      return this.srsMsm;
    }
    const hit = this.lru.get(n);
    if (hit) {
      // Refresh recency.
      this.lru.delete(n);
      this.lru.set(n, hit);
      return hit;
    }
    // Build before inserting — a throw leaves the cache clean.
    const fresh = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false });
    while (this.lru.size >= MSM_LRU_CAP) {
      const oldest = this.lru.keys().next().value as number;
      this.lru.get(oldest)!.destroy();
      this.lru.delete(oldest);
    }
    this.lru.set(n, fresh);
    return fresh;
  }

  private evict(n: number): void {
    if (n === this.srsN) {
      this.srsMsm?.destroy();
      this.srsMsm = null;
    } else {
      const m = this.lru.get(n);
      if (m) {
        m.destroy();
        this.lru.delete(n);
      }
    }
  }

  /**
   * `OP_MSM` — run one MSM. With `combineOnHost: false`, MsmV2 yields the
   * per-window sums; they are written to the result region (`numWindows × 64`
   * canonical LE bytes) and `numWindows` + `c` go in the SAB slots, so the C++
   * hook Horner-combines them in native bb::g1.
   *
   * `points_ptr === 0` means the MSM's points are a prefix of the published SRS
   * — the shared pool is used. A non-zero pointer is an off-SRS point set; a
   * one-off pool + instance is built for it and torn down after the run.
   */
  private async runMsm(): Promise<void> {
    const n = Atomics.load(this.ctrl, SLOT_N);
    const pointsPtr = Atomics.load(this.ctrl, SLOT_POINTS_PTR);
    const scalarsPtr = Atomics.load(this.ctrl, SLOT_SCALARS_PTR);
    const resultPtr = Atomics.load(this.ctrl, SLOT_RESULT_PTR);

    if (n === 0) {
      Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, 0);
      Atomics.store(this.ctrl, SLOT_C, 0);
      return;
    }

    const scalars = this.wasmSliceCopy(scalarsPtr, n * 32);

    let msm: MsmV2;
    let oneOff: { pool: MsmV2Pool; msm: MsmV2 } | null = null;
    if (pointsPtr === 0) {
      if (this.pool === null || n > this.srsN) {
        throw new Error(`WebGPU bridge: SRS-prefix MSM n=${n} with no matching pool (srsN=${this.srsN})`);
      }
      msm = await this.getOrCreateMsm(n);
    } else {
      const device = await this.getDevice();
      const pointBytes = this.wasmSliceCopy(pointsPtr, n * 64);
      const pool = await MsmV2Pool.create(device, pointBytes);
      msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false });
      oneOff = { pool, msm };
    }

    try {
      msm.prepare(scalars);
      const { windowSums, c } = await msm.run();
      this.writeWindowSumsLE(resultPtr, windowSums);
      Atomics.store(this.ctrl, SLOT_NUM_WINDOWS, windowSums.length);
      Atomics.store(this.ctrl, SLOT_C, c);
    } catch (e) {
      // A cached instance's prepared buffers may be torn — drop it so the next
      // request rebuilds. A one-off is torn down in `finally` regardless.
      if (oneOff === null) this.evict(n);
      throw e;
    } finally {
      if (oneOff) {
        oneOff.msm.destroy();
        oneOff.pool.destroy();
      }
    }
  }

  private writeWindowSumsLE(resultPtr: number, windows: { x: bigint; y: bigint }[]): void {
    if (this.wasmMemory === null) {
      throw new Error('WebGPU bridge: wasm memory not set');
    }
    const out = new Uint8Array(this.wasmMemory.buffer, resultPtr, windows.length * 64);
    for (let w = 0; w < windows.length; w++) {
      writeBigIntLE(out, w * 64, windows[w].x, 32);
      writeBigIntLE(out, w * 64 + 32, windows[w].y, 32);
    }
  }
}

function writeBigIntLE(out: Uint8Array, offset: number, v: bigint, byteLength: number): void {
  let cur = v;
  const mask = 0xffn;
  for (let i = 0; i < byteLength; i++) {
    out[offset + i] = Number(cur & mask);
    cur >>= 8n;
  }
}

export { writeBigIntLE };
