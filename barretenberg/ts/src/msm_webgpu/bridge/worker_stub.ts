import {
  CTRL_SLOTS,
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
  public getEnvImports(): Record<string, (...args: number[]) => void> {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
      bb_external_msm_bn254: (
        points_ptr: number,
        scalars_ptr: number,
        n: number,
        result_ptr: number,
      ) => this.callMsm(points_ptr, scalars_ptr, n, result_ptr),
      bb_publish_srs_bn254: (points_ptr: number, n: number) =>
        this.callPublishSrs(points_ptr, n),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
  }

  private callMsm(
    points_ptr: number,
    scalars_ptr: number,
    n: number,
    result_ptr: number,
  ): void {
    Atomics.store(this.ctrl, SLOT_OPCODE, OP_MSM);
    Atomics.store(this.ctrl, SLOT_N, n);
    Atomics.store(this.ctrl, SLOT_POINTS_PTR, points_ptr);
    Atomics.store(this.ctrl, SLOT_SCALARS_PTR, scalars_ptr);
    Atomics.store(this.ctrl, SLOT_RESULT_PTR, result_ptr);
    this.signalAndWait();
  }

  private callPublishSrs(points_ptr: number, n: number): void {
    Atomics.store(this.ctrl, SLOT_OPCODE, OP_PUBLISH_SRS);
    Atomics.store(this.ctrl, SLOT_N, n);
    Atomics.store(this.ctrl, SLOT_POINTS_PTR, points_ptr);
    this.signalAndWait();
  }

  private signalAndWait(): void {
    Atomics.store(this.ctrl, SLOT_STATE, STATE_REQUEST);
    this.post('msm_request');
    // Block until the main thread flips STATE_REQUEST → STATE_DONE or
    // STATE_ERROR. The third argument is a timeout — `Infinity` means
    // wait forever, but in practice the main thread should always
    // resolve quickly.
    const waitResult = Atomics.wait(this.ctrl, SLOT_STATE, STATE_REQUEST);
    // `Atomics.wait` returns 'ok' if woken, 'not-equal' if the value
    // changed before we waited, 'timed-out' if a timeout was set. Any
    // result is fine here — we always re-read the state slot.
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
