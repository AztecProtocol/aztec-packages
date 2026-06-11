// Shared protocol between the WASM worker (which exposes the imports
// `bb_external_msm_bn254` and `bb_publish_srs_bn254`) and the main
// thread (which holds the GPUDevice and runs the actual WebGPU MSM).
//
// The bridge is a `SharedArrayBuffer` holding one Int32 control block
// plus the operation arguments. The worker writes the request,
// `Atomics.notify`s a message channel to wake the main thread,
// `Atomics.wait`s on the state slot. The main thread reads the
// request out of WASM linear memory (which is itself shared, so no
// extra copy), runs the MSM asynchronously, writes the result back
// into WASM memory, and bumps the state slot to release the worker.

/** Number of i32 slots in the control SAB. */
export const CTRL_SLOTS = 16;
/** Byte size of the control SAB. */
export const CTRL_BYTES = CTRL_SLOTS * 4;

// Slot indices in the Int32Array view of the control SAB.
export const SLOT_STATE = 0;
export const SLOT_OPCODE = 1;
export const SLOT_N = 2;
export const SLOT_POINTS_PTR = 3;
export const SLOT_SCALARS_PTR = 4;
export const SLOT_RESULT_PTR = 5;
export const SLOT_ERROR_CODE = 6;
// OP_MSM result metadata the host writes back: the per-window-sum count and the
// Pippenger window-bit width `c`. The worker stub packs them into the
// `bb_external_msm_bn254` return value so the C++ hook can Horner-combine the
// windows in native bb::g1.
export const SLOT_NUM_WINDOWS = 7;
export const SLOT_C = 8;
// Point-index offset into the published SRS pool, written by the worker when
// SLOT_POINTS_PTR is 0 (SRS-prefix path). Lets every commit share the one
// uploaded pool regardless of the polynomial's start_index in the C++ SRS.
export const SLOT_SRS_OFFSET = 9;
// Batch-MSM extension. OP_BATCH_MSM runs N MSMs in a single GPU submit
// (and one mapAsync wait), which collapses what was N × ~20 ms of Chrome
// event-loop polling latency into a single wait. SLOT_N carries the
// batch count; SLOT_POINTS_PTR points at a packed array of per-MSM
// descriptors (5 u32s each — see the C++ side for layout); SLOT_SCALARS_PTR
// at the concatenated scalars buffer; SLOT_RESULT_PTR at the concatenated
// per-MSM result regions; SLOT_BATCH_META_PTR at the per-MSM (num_windows, c)
// metadata the C++ side reads to drive `combine_windows`.
export const SLOT_BATCH_META_PTR = 10;
// Optional per-MSM labels for telemetry, packed as `batch_count` consecutive
// records of `u8 len + len ASCII bytes`. Pointer is 0 when no labels were
// supplied (the C++ hook only fills this when a labels span was threaded
// through from the commit call site).
export const SLOT_BATCH_LABELS_PTR = 11;
// Early-exit staged partials per window (halving reduce): 0 = the result
// region holds finished per-window affine roots (legacy, 64 B each);
// > 0 = it holds `num_windows × partials` staged Jacobian points (96 B
// each, raw Montgomery limbs, z == 0 absent) and the C++ hook runs
// finish_and_combine_windows instead of combine_windows.
export const SLOT_PARTIALS = 12;

// Values for SLOT_STATE.
export const STATE_IDLE = 0;
export const STATE_REQUEST = 1;
export const STATE_DONE = 2;
export const STATE_ERROR = 3;

// Values for SLOT_OPCODE.
export const OP_MSM = 1;
export const OP_PUBLISH_SRS = 2;
export const OP_BATCH_MSM = 3;

// Error codes the main thread can put in SLOT_ERROR_CODE when STATE_ERROR.
export const ERR_GENERIC = 1;
export const ERR_NO_HOST = 2;

/**
 * Construct a fresh shared control buffer. Throws if SharedArrayBuffer
 * isn't available (cross-origin isolation missing).
 */
export function createControlBuffer(): SharedArrayBuffer {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error('WebGPU MSM bridge requires SharedArrayBuffer (page needs COOP/COEP headers)');
  }
  return new SharedArrayBuffer(CTRL_BYTES);
}
