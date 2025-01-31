import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import { SHARED_MUTABLE_HASH_SEPARATOR } from '../../constants.gen.js';

export * from './scheduled_delay_change.js';
export * from './scheduled_value_change.js';

export async function computeSharedMutableHashSlot(sharedMutableSlot: Fr) {
  return await poseidon2HashWithSeparator([sharedMutableSlot], SHARED_MUTABLE_HASH_SEPARATOR);
}
