import { G_SLOT } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { GrumpkinScalar, type Point, type Fr } from '@aztec/foundation/fields';

/**
 * Computes the resulting storage slot for an entry in a mapping.
 * @param mappingSlot - The slot of the mapping within state.
 * @param key - The key of the mapping.
 * @returns The slot in the contract storage where the value is stored.
 * TODO(benesjan): Called derive_storage_slot_in_map in Noir - rename to match.
 * TODO(benesjan): Move to circuit.js storage_slot directory.
 * TODO(benesjan): Test that it matches Noir.
 */
export function computeSlotForMapping(
  mappingSlot: Point,
  key: {
    /** Serialize to a field. */
    toField: () => Fr;
  },
): Point {
  const grumpkin = new Grumpkin();
  const scalar = new GrumpkinScalar(key.toField().toBigInt());
  return grumpkin.add(grumpkin.mul(G_SLOT, scalar), mappingSlot);
}
