export * from './private/index.js';
export { WASMSimulator } from './private/providers/acvm_wasm.js';
export { SimulationProviderRecorderWrapper } from './private/providers/circuit_recording/simulation_provider_recorder_wrapper.js';
export { MemoryCircuitRecorder } from './private/providers/circuit_recording/memory_circuit_recorder.js';
export { type SimulationProvider, type DecodedError } from './private/providers/simulation_provider.js';
export * from './common/index.js';
