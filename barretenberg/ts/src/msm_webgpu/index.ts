// Public entry point for the WebGPU BN254 MSM port. Only the
// SRS-warm-path entries are surfaced here; the underlying
// `compute_curve_msm` driver and the cold `compute_bn254_msm` /
// `compute_bn254_msm_with_context` entries are also re-exported for
// integration tests and benchmarks.

export {
  compute_bn254_msm,
  compute_bn254_msm_with_context,
  compute_bn254_msm_cached,
  compute_bn254_msm_batch_affine,
  compute_bn254_msm_debug_trace,
} from "./msm.js";
export type { ProfileCapture } from "./msm.js";

export { GpuContext } from "./cuzk/gpu_context.js";
export { CachedBases, precompute_bn254_bases } from "./cuzk/cached_bases.js";
export { BN254_CURVE_CONFIG } from "./cuzk/curve_config.js";
export type { CurveConfig } from "./cuzk/curve_config.js";
export type { BigIntPoint, U32ArrayPoint } from "./types.js";

export {
  compute_bn254_msm_auto,
  pickNtm,
  PICK_NTM_CROSSOVER_N,
} from "./cuzk/size_dispatcher.js";
export { TrivialMsm } from "./cuzk/trivial_msm.js";

// Bridge — used by the bb.js factory when constructing a worker that
// hosts the BN254 WebGPU MSM hook.
export {
  createControlBuffer,
  CTRL_BYTES,
  CTRL_SLOTS,
} from "./bridge/protocol.js";
export { WebGpuMsmWorkerStub } from "./bridge/worker_stub.js";
export { WebGpuMsmHost } from "./bridge/main.js";
export {
  setupWebGpuMsmBridge,
  installWorkerStub,
} from "./setup.js";
export type { WebGpuBridgeHandle } from "./setup.js";
