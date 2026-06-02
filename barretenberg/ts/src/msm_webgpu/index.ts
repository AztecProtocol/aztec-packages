// Public entry point for the WebGPU BN254 MSM. `MsmPool` is the SRS point pool
// (uploaded + Montgomery-converted once); two backends draw from it — the
// stream-walker (`MsmStreamWalker`, low memory) and the transpose/cuZK
// (`MsmHighMemory`, high memory). `createMsm` picks one via `config.backend`.
// The bridge exports wire it into the bb.js WASM worker.

export { MsmPool } from "./msm_pool.js";
export { MsmStreamWalker, MsmStreamWalkerPool } from "./msm_stream_walker.js";
export { MsmHighMemory, MsmHighMemoryPool } from "./msm_high_memory.js";
export { createMsm, createMsmPool } from "./msm.js";
export type { Msm, MsmRunResult, BackendPool } from "./msm.js";
export type { MsmConfig, ProfileBreakdown, MsmBackendKind, Pt } from "./msm_types.js";

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
