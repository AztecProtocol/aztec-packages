import { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/index.js';

// TODO(#7551): this is copied over from noir-projects/aztec-nr/aztec/src/generators.nr --> test that we get a match with noir

// The following generator is used to compute an inner note hash - used to silo note content hash with with storage slot
export const G_BASE_SLOT = new Point(
  new Fr(0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15n),
  new Fr(0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791n),
  false,
);
export const G_MAP_SLOT_LAYER_1 = new Point(
  new Fr(0x0e0dad2250583f2a9f0acb04ededf1701b85b0393cae753fe7e14b88af81cb52n),
  new Fr(0x0973b02c5caac339ee4ad5dab51329920f7bf1b6a07e1dabe5df67040b300962n),
  false,
);

// Derive a base slot (using the base generator) from a slot preimage
export function deriveBaseSlot(slotPreimage: number | bigint | Fr): Point {
  const grumpkin = new Grumpkin();
  const slotPreimageScalar = new GrumpkinScalar(new Fr(slotPreimage).toBigInt());
  return grumpkin.mul(G_BASE_SLOT, new GrumpkinScalar(slotPreimageScalar));
}
