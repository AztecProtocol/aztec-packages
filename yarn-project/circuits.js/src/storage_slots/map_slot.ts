// TODO(benesjan): update cheatcodes to use this
import { G_MAP_SLOT_LAYER_1 } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { type Fr, GrumpkinScalar, type Point } from '@aztec/foundation/fields';

/**
 * Computes the resulting storage slot for an entry in a map.
 * @param mapSlot - The slot of the map within state.
 * @param key - The key of the map.
 * @returns The slot in the contract storage where the value is stored.
 * TODO(#7551): Test that it matches Noir.
 */
export function deriveStorageSlotInMap(
  mapSlot: Point,
  key: {
    /** Serialize to a field. */
    toField: () => Fr;
  },
): Point {
  const grumpkin = new Grumpkin();
  const scalar = new GrumpkinScalar(key.toField().toBigInt());
  return grumpkin.add(grumpkin.mul(G_MAP_SLOT_LAYER_1, scalar), mapSlot);
}
