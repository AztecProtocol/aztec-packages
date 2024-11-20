import {
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelResetDimensions,
  privateKernelResetDimensionNames,
} from '@aztec/circuits.js';
import { pushTestData } from '@aztec/foundation/testing';

import {
  mapPrivateKernelCircuitPublicInputsToNoir,
  mapPrivateKernelDataToNoir,
  mapPrivateKernelResetHintsToNoir,
} from '../conversion/client.js';
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

/**
 * TODO: This is a hack so we can write full reset inputs to a Prover.toml.
 * Ideally we remove it in favour of adding a test that runs a full reset.
 */
export function updateResetCircuitSampleInputs(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputs,
) {
  /* eslint-disable camelcase */
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };

  pushTestData('private-kernel-reset', inputs);
}
