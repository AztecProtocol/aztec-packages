export {
  convertPrivateKernelInit2InputsToWitnessMapWithAbi,
  convertPrivateKernelInit2OutputsFromWitnessMapWithAbi,
  convertPrivateKernelInit3InputsToWitnessMapWithAbi,
  convertPrivateKernelInit3OutputsFromWitnessMapWithAbi,
  convertPrivateKernelInitInputsToWitnessMapWithAbi,
  convertPrivateKernelInitOutputsFromWitnessMapWithAbi,
  convertPrivateKernelInner2InputsToWitnessMapWithAbi,
  convertPrivateKernelInner2OutputsFromWitnessMapWithAbi,
  convertPrivateKernelInner3InputsToWitnessMapWithAbi,
  convertPrivateKernelInner3OutputsFromWitnessMapWithAbi,
  convertPrivateKernelInnerInputsToWitnessMapWithAbi,
  convertPrivateKernelInnerOutputsFromWitnessMapWithAbi,
  convertPrivateKernelResetInputsToWitnessMapWithAbi,
  convertPrivateKernelResetOutputsFromWitnessMapWithAbi,
  convertPrivateKernelResetTailInputsToWitnessMapWithAbi,
  convertPrivateKernelResetTailToPublicInputsToWitnessMapWithAbi,
  convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailOutputsFromWitnessMapWithAbi,
  convertHidingKernelToRollupInputsToWitnessMapWithAbi,
  convertHidingKernelPublicInputsToWitnessMapWithAbi,
} from '../../execution/client.js';

export {
  getPrivateKernelResetArtifactName,
  getPrivateKernelResetTailArtifactName,
  updateResetCircuitSampleInputs,
} from '../../utils/private_kernel_reset.js';
export {
  maxPrivateKernelResetDimensions,
  privateKernelResetDimensionsConfig,
} from '../../private_kernel_reset_types.js';
export { foreignCallHandler } from '../../utils/client/foreign_call_handler.js';

export { type ClientProtocolArtifact } from '../../artifacts/types.js';
