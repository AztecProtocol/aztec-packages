import {
  CTRL_SLOTS,
  ERR_GENERIC,
  OP_BATCH_MSM,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_BATCH_LABELS_PTR,
  SLOT_BATCH_META_PTR,
  SLOT_C,
  SLOT_ERROR_CODE,
  SLOT_N,
  SLOT_PARTIALS,
  SLOT_NUM_WINDOWS,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_SRS_OFFSET,
  SLOT_STATE,
  STATE_DONE,
  STATE_ERROR,
  STATE_IDLE,
  STATE_REQUEST,
} from './protocol.js';

/**
 * Per-worker singleton that exposes the JS imports
 * `bb_external_msm_bn254` and `bb_publish_srs_bn254` to a barretenberg
 * WASM instance running under `BBERG_WEBGPU_MSM_HOOK`.
 *
 * Wiring:
 *   - Construct with a `SharedArrayBuffer` that the main thread also
 *     holds a reference to (the control block).
 *   - Pass `getEnvImports()` into the `env` object when instantiating
 *     the WASM module.
 *   - The main thread must have set up a corresponding `WebGpuMsmHost`
 *     listening for `'msm_request'` messages on this worker.
 *
 * Each import call blocks the worker via `Atomics.wait` after posting
 * a wake message. That's safe because the WASM build that uses this
 * hook is single-threaded (`NO_MULTITHREADING`) and runs in a Worker,
 * so blocking only stalls the worker — not the main thread.
 */
export class WebGpuMsmWorkerStub {
  private readonly ctrl: Int32Array;
  private readonly post: (msg: string) => void;

  constructor(ctrl_sab: SharedArrayBuffer, post: (msg: string) => void) {
    if (ctrl_sab.byteLength < CTRL_SLOTS * 4) {
      throw new Error('control SAB too small');
    }
    this.ctrl = new Int32Array(ctrl_sab);
    this.post = post;
  }

  /**
   * Returns the WASM env imports for the WebGPU bridge. Caller merges
   * these into the env object passed to `WebAssembly.instantiate`.
   */
  public getEnvImports(): {
    bb_external_msm_bn254: (
      points_ptr: number,
      scalars_ptr: number,
      n: number,
      result_ptr: number,
      srs_offset: number,
    ) => number;
    bb_external_batch_msm_bn254: (
      batch_count: number,
      descriptors_ptr: number,
      scalars_base: number,
      results_base: number,
      meta_base: number,
      labels_packed: number,
    ) => void;
    bb_external_batch_msm_bn254_start: (
      batch_count: number,
      descriptors_ptr: number,
      scalars_base: number,
      results_base: number,
      meta_base: number,
      labels_packed: number,
    ) => void;
    bb_external_batch_msm_bn254_await: () => void;
    bb_publish_srs_bn254: (points_ptr: number, n: number) => void;
  } {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
      bb_external_msm_bn254: (points_ptr, scalars_ptr, n, result_ptr, srs_offset) =>
        this.callMsm(points_ptr, scalars_ptr, n, result_ptr, srs_offset),
      bb_external_batch_msm_bn254: (
        batch_count,
        descriptors_ptr,
        scalars_base,
        results_base,
        meta_base,
        labels_packed,
      ) => this.callBatchMsm(batch_count, descriptors_ptr, scalars_base, results_base, meta_base, labels_packed),
      // CPU/GPU work-sharing: post the batch request without blocking (`_start`),
      // then block for the result later (`_await`). Between the two the C++ side
      // runs the CPU-routed MSMs, overlapping the GPU.
      bb_external_batch_msm_bn254_start: (
        batch_count,
        descriptors_ptr,
        scalars_base,
        results_base,
        meta_base,
        labels_packed,
      ) => this.startBatchMsm(batch_count, descriptors_ptr, scalars_base, results_base, meta_base, labels_packed),
      bb_external_batch_msm_bn254_await: () => this.waitForDone(),
      bb_publish_srs_bn254: (points_ptr, n) => this.callPublishSrs(points_ptr, n),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
  }

  /**
   * Service a batched-MSM request — all MSMs run on the GPU in one submit +
   * one mapAsync, collapsing N × ~30 ms of per-call Chrome event-loop polling
   * latency into a single wait. The C++ side packs all descriptors + scalars
   * + result regions into contiguous WASM-memory buffers and points the host
   * at them via the SAB slots.
   */
  private storeBatchSlots(
    batch_count: number,
    descriptors_ptr: number,
    scalars_base: number,
    results_base: number,
    meta_base: number,
    labels_packed: number,
  ): void {
    Atomics.store(this.ctrl, SLOT_OPCODE, OP_BATCH_MSM);
    Atomics.store(this.ctrl, SLOT_N, batch_count);
    Atomics.store(this.ctrl, SLOT_BATCH_LABELS_PTR, labels_packed);
    Atomics.store(this.ctrl, SLOT_POINTS_PTR, descriptors_ptr);
    Atomics.store(this.ctrl, SLOT_SCALARS_PTR, scalars_base);
    Atomics.store(this.ctrl, SLOT_RESULT_PTR, results_base);
    Atomics.store(this.ctrl, SLOT_BATCH_META_PTR, meta_base);
  }

  private callBatchMsm(
    batch_count: number,
    descriptors_ptr: number,
    scalars_base: number,
    results_base: number,
    meta_base: number,
    labels_packed: number,
  ): void {
    this.storeBatchSlots(batch_count, descriptors_ptr, scalars_base, results_base, meta_base, labels_packed);
    this.signalAndWait();
  }

  /** Post a batch request and RETURN without blocking — the result is collected
   *  by a later `waitForDone()`. The C++ side runs the CPU MSMs in between. */
  private startBatchMsm(
    batch_count: number,
    descriptors_ptr: number,
    scalars_base: number,
    results_base: number,
    meta_base: number,
    labels_packed: number,
  ): void {
    this.storeBatchSlots(batch_count, descriptors_ptr, scalars_base, results_base, meta_base, labels_packed);
    this.signal();
  }

  /**
   * Service an MSM request. Returns `(numWindows << 16) | c` — the per-window-sum
   * count and window-bit width the host wrote back, which the C++ hook unpacks
   * to Horner-combine the windows.
   *
   * `srs_offset` is the point-index offset into the published SRS pool when
   * `points_ptr === 0` (the common SRS-prefix path); the host adds it to every
   * point lookup in the MSM so a single uploaded pool serves all polynomial
   * commits regardless of their start_index. Ignored when `points_ptr !== 0`.
   */
  private callMsm(points_ptr: number, scalars_ptr: number, n: number, result_ptr: number, srs_offset: number): number {
    Atomics.store(this.ctrl, SLOT_OPCODE, OP_MSM);
    Atomics.store(this.ctrl, SLOT_N, n);
    Atomics.store(this.ctrl, SLOT_POINTS_PTR, points_ptr);
    Atomics.store(this.ctrl, SLOT_SCALARS_PTR, scalars_ptr);
    Atomics.store(this.ctrl, SLOT_RESULT_PTR, result_ptr);
    Atomics.store(this.ctrl, SLOT_SRS_OFFSET, srs_offset);
    this.signalAndWait();
    const numWindows = Atomics.load(this.ctrl, SLOT_NUM_WINDOWS);
    const c = Atomics.load(this.ctrl, SLOT_C);
    const partials = Atomics.load(this.ctrl, SLOT_PARTIALS);
    return (((partials & 0xff) << 24) | ((numWindows & 0xff) << 16) | (c & 0xffff)) >>> 0;
  }

  private callPublishSrs(points_ptr: number, n: number): void {
    Atomics.store(this.ctrl, SLOT_OPCODE, OP_PUBLISH_SRS);
    Atomics.store(this.ctrl, SLOT_N, n);
    Atomics.store(this.ctrl, SLOT_POINTS_PTR, points_ptr);
    this.signalAndWait();
  }

  private signalAndWait(): void {
    this.signal();
    this.waitForDone();
  }

  /** Publish the request and wake the host, without waiting for the result. */
  private signal(): void {
    Atomics.store(this.ctrl, SLOT_STATE, STATE_REQUEST);
    this.post('msm_request');
  }

  /** Block until the host flips STATE_REQUEST → STATE_DONE / STATE_ERROR. */
  private waitForDone(): void {
    // The third argument is a timeout — `Infinity` means wait forever, but in
    // practice the main thread should always resolve quickly. If the host
    // already finished (state moved past REQUEST before we waited, e.g. when the
    // CPU work in a work-sharing window outlasted the GPU), `Atomics.wait`
    // returns 'not-equal' immediately — fine, we always re-read the state slot.
    const waitResult = Atomics.wait(this.ctrl, SLOT_STATE, STATE_REQUEST);
    void waitResult;
    const state = Atomics.load(this.ctrl, SLOT_STATE);
    if (state === STATE_ERROR) {
      const code = Atomics.load(this.ctrl, SLOT_ERROR_CODE);
      // We can't throw from inside a WASM import without aborting the
      // module, but throwing a JS Error here propagates as a trap which
      // is the right semantic for "the host failed".
      Atomics.store(this.ctrl, SLOT_STATE, STATE_IDLE);
      throw new Error(`WebGPU MSM bridge error code ${code}`);
    }
    if (state !== STATE_DONE) {
      Atomics.store(this.ctrl, SLOT_STATE, STATE_IDLE);
      throw new Error(`WebGPU MSM bridge unexpected state ${state}`);
    }
    Atomics.store(this.ctrl, SLOT_STATE, STATE_IDLE);
  }

  /**
   * Test helper. Synchronously fails an in-flight request without
   * involving WebGPU. Used by the bridge unit test to verify the error
   * path. Production callers don't touch this — they signal errors
   * from the main-thread side.
   */
  public _signalErrorForTest(code = ERR_GENERIC): void {
    Atomics.store(this.ctrl, SLOT_ERROR_CODE, code);
    Atomics.store(this.ctrl, SLOT_STATE, STATE_ERROR);
    Atomics.notify(this.ctrl, SLOT_STATE, 1);
  }
}
