import {
  MAX_ENCRYPTED_LOGS_PER_TX,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  PrivateKernelResetDimensions,
  privateKernelResetDimensionNames,
} from '@aztec/circuits.js';

import { PrivateKernelResetArtifacts, type PrivateResetArtifact } from '../private_kernel_reset_data.js';

// Must match the values in noir-projects/noir-protocol-circuits/crates/private-kernel-reset/src/main.nr
export const maxPrivateKernelResetDimensions = PrivateKernelResetDimensions.fromValues([
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_ENCRYPTED_LOGS_PER_TX,
]);

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
