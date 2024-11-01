import { type PrivateKernelResetDimensions, privateKernelResetDimensionNames } from '@aztec/circuits.js';

import { PrivateKernelResetArtifacts, type PrivateResetArtifact } from '../private_kernel_reset_data.js';

export function createPrivateKernelResetTag(dimensions: PrivateKernelResetDimensions) {
  return privateKernelResetDimensionNames.map(name => dimensions[name]).join('_');
}

export function getPrivateKernelResetArtifactName(dimensions: PrivateKernelResetDimensions) {
  const tag = createPrivateKernelResetTag(dimensions);
  const name = `PrivateKernelResetArtifact_${tag}` as PrivateResetArtifact;
  if (!PrivateKernelResetArtifacts[name]) {
    throw new Error(`Unknown private reset artifact: ${name}`);
  }
  return name;
}
