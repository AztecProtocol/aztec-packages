// Public entry point for the WebGPU BN254 MSM. `MsmV2Pool` (the SRS point pool,
// uploaded + Montgomery-converted once) and `MsmV2` (the per-size pipeline) are
// the algorithm; the bridge exports wire it into the bb.js WASM worker.

export { MsmV2, MsmV2Pool } from './msm_v2.js';
export type { MsmConfig, ProfileBreakdown, PassSample, HostPhases } from './msm_v2.js';

export { BatchMsmV2 } from './batch_msm.js';
export type { BatchMsmConfig, BatchMsmResult } from './batch_msm.js';

export { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
export type { CurveConfig } from './cuzk/curve_config.js';
export type { BigIntPoint, U32ArrayPoint } from './types.js';

// Runtime capability gate — routes a device to WASM when the WebGPU MSM is
// wrong (e.g. Adreno-740 / Galaxy S23) or slower than WASM (e.g. Pixel-10).
export {
  decideFromProbe,
  resolveGate,
  makeGateProbe,
  peekGateVerdict,
  adapterKeyFromInfo,
  DEFAULT_GATE_POLICY,
} from './cuzk/capability_gate.js';
export type {
  GateReason,
  GateVerdict,
  GatePolicy,
  ProbeResult,
  ProbeIO,
  GateProbe,
  TimedMsm,
  MsmPoint,
  AdapterInfoLike,
} from './cuzk/capability_gate.js';

// Bridge — used by the bb.js factory when constructing a worker that hosts the
// BN254 WebGPU MSM hook.
export { createControlBuffer, CTRL_BYTES, CTRL_SLOTS } from './bridge/protocol.js';
export { WebGpuMsmWorkerStub } from './bridge/worker_stub.js';
export { WebGpuMsmHost } from './bridge/main.js';
export { setupWebGpuMsmBridge, installWorkerStub } from './setup.js';
export type { WebGpuBridgeHandle } from './setup.js';
