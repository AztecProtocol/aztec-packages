import { type PrivateKernelResetDimensions, privateKernelResetDimensionNames } from '@aztec/circuits.js';

import { PrivateKernelResetArtifactFileNames, type PrivateResetArtifact } from '../private_kernel_reset_types.js';

export function createPrivateKernelResetTag(dimensions: PrivateKernelResetDimensions) {
  return privateKernelResetDimensionNames.map(name => dimensions[name]).join('_');
}

export function getPrivateKernelResetArtifactName(dimensions: PrivateKernelResetDimensions) {
  const tag = createPrivateKernelResetTag(dimensions);
  const name = `PrivateKernelResetArtifact_${tag}` as PrivateResetArtifact;
  if (!PrivateKernelResetArtifactFileNames[name]) {
    throw new Error(`Unknown private reset artifact: ${name}`);
  }
  return name;
}
