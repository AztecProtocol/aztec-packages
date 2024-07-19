import { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/index.js';

// TODO(benesjan): this is copied over from noir-projects/aztec-nr/aztec/src/generators.nr --> test that we get a match with noir

// The following generator is used to compute an inner note hash - used to silo note content hash with with storage slot
export const G_SLOT = new Point(
  new Fr(0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15n),
  new Fr(0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791n),
  false,
);

// TODO(benesjan): hardcode first few values for speedup
// Derive a base slot (using the base generator) from a slot preimage
export function deriveBaseSlot(slotPreimage: Fr): Point {
  // We check that the slot preimage fits into 128 bits --> this is ok for base slots
  if (slotPreimage.toBigInt() >= BigInt(2) ** BigInt(128)) {
    throw new Error('Slot preimage exceeds 128 bits');
  }

  const grumpkin = new Grumpkin();
  return grumpkin.mul(G_SLOT, new GrumpkinScalar(slotPreimage.toBigInt()));
}
