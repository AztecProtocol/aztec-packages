import { DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { Fr } from '@aztec/foundation/curves/bn254';

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
): Promise<Fr> {
  return poseidon2HashWithSeparator([mapSlot, key.toField()], DomainSeparator.PUBLIC_STORAGE_MAP_SLOT);
}
