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
} from '../../execution/client/lazy.js';

export { type ClientProtocolArtifact } from '../../artifacts/types.js';
export {
  getClientCircuitArtifactByName,
  getSimulatedClientCircuitArtifactByName,
} from '../../artifacts/client/lazy.js';

export { getPrivateKernelResetArtifactName } from '../../utils/private_kernel_reset.js';
export {
  maxPrivateKernelResetDimensions,
  privateKernelResetDimensionsConfig,
} from '../../private_kernel_reset_types.js';
export { foreignCallHandler } from '../../utils/client/foreign_call_handler.js';
