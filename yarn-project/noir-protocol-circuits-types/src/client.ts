export {
  convertPrivateKernelInitInputsToWitnessMap,
  convertPrivateKernelInitOutputsFromWitnessMap,
  convertPrivateKernelInnerInputsToWitnessMap,
  convertPrivateKernelInnerOutputsFromWitnessMap,
  convertPrivateKernelResetInputsToWitnessMap,
  convertPrivateKernelResetOutputsFromWitnessMap,
  convertPrivateKernelTailForPublicOutputsFromWitnessMap,
  convertPrivateKernelTailInputsToWitnessMap,
  convertPrivateKernelTailOutputsFromWitnessMap,
  convertPrivateKernelTailToPublicInputsToWitnessMap,
  executeInit,
  executeInner,
  executeReset,
  executeTail,
  executeTailForPublic,
} from './execution/client.js';

export { ClientCircuitArtifacts, type ClientProtocolArtifact } from './artifacts/client.js';

export { getPrivateKernelResetArtifactName } from './utils/private_kernel_reset.js';
export { maxPrivateKernelResetDimensions, privateKernelResetDimensionsConfig } from './private_kernel_reset_data.js';
export { foreignCallHandler } from './utils/client/foreign_call_handler.js';
export { ClientCircuitVks, getVKIndex, getVKTreeRoot, getVKSiblingPath } from './vks.js';
