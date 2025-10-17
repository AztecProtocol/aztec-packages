import { poseidon2Hash } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';

/**
 * Computes the storage slot for a value in a map-like data structure.
 *
 * In Aztec contracts, maps (key-value storage) need to derive unique storage slots
 * for each key. This function combines the map's base slot with a key to produce
 * a deterministic, unique storage slot for that key's value.
 *
 * @param mapSlot - The base storage slot where the map is stored
 * @param key - The key object (must have a toField() method)
 * @returns A promise that resolves to the derived storage slot
 *
 * @remarks
 * The slot is computed as: `poseidon2Hash([mapSlot, key.toField()])`
 *
 * This ensures:
 * - Each key gets a unique storage slot
 * - Storage slots are deterministically derived (same key = same slot)
 * - Collision resistance between different keys
 * - Keys can be any type that implements toField()
 *
 * @example
 * ```typescript
 * import { AztecAddress } from '../aztec-address';
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // For a map at slot 5, get the storage slot for a specific address key
 * const mapBaseSlot = Fr.fromNumber(5);
 * const userAddress = AztecAddress.fromString('0x123...');
 *
 * const storageSlot = await deriveStorageSlotInMap(mapBaseSlot, userAddress);
 * // storageSlot can now be used to read/write the value for this key
 *
 * // Works with any key type that has toField()
 * const numberKey = Fr.fromNumber(42);
 * const slot2 = await deriveStorageSlotInMap(mapBaseSlot, {
 *   toField: () => numberKey
 * });
 * ```
 *
 * @see {@link https://docs.aztec.network/guides/smart_contracts/writing_contracts/storage | Aztec Storage Documentation}
 */
export function deriveStorageSlotInMap(
  mapSlot: Fr | bigint,
  key: {
    /** Convert key to a field. */
    toField: () => Fr;
  },
): Promise<Fr> {
  return poseidon2Hash([mapSlot, key.toField()]);
}
