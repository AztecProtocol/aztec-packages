import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import { MAP_STORAGE_SLOT_SEPARATOR } from '../constants.gen.js';

/**
 * Computes the resulting storage slot for an entry in a map.
 * @param mapSlot - The slot of the map within state.
 * @param key - The key of the map.
 * @returns The slot in the contract storage where the value is stored.
 */
export function deriveStorageSlotInMap(
  mapSlot: Fr | bigint,
  key: {
    /** Convert key to a field. */
    toField: () => Fr;
  },
): Fr {
  return poseidon2HashWithSeparator([mapSlot, key.toField()], MAP_STORAGE_SLOT_SEPARATOR);
}
