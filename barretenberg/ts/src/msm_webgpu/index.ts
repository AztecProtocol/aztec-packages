// Public entry point for the WebGPU BN254 MSM. `MsmV2Pool` (the SRS point pool,
// uploaded + Montgomery-converted once) and `MsmV2` (the per-size pipeline) are
// the algorithm; the bridge exports wire it into the bb.js WASM worker.

export { MsmV2, MsmV2Pool } from "./msm_v2.js";
export type { MsmConfig, ProfileBreakdown } from "./msm_v2.js";

export { BN254_CURVE_CONFIG } from "./cuzk/curve_config.js";
export type { CurveConfig } from "./cuzk/curve_config.js";
export type { BigIntPoint, U32ArrayPoint } from "./types.js";

// Bridge — used by the bb.js factory when constructing a worker that hosts the
// BN254 WebGPU MSM hook.
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
