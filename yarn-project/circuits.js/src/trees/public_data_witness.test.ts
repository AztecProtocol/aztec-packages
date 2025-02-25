import { PUBLIC_DATA_TREE_HEIGHT } from '@aztec/constants';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { SiblingPath } from '@aztec/foundation/trees';

import { PublicDataTreeLeafPreimage } from './public_data_leaf.js';
import { PublicDataWitness } from './public_data_witness.js';

describe('contract_artifact', () => {
  it('serializes and deserializes an instance', () => {
    const witness = makePublicDataWitness(randomInt(1000000));

    const deserialized = PublicDataWitness.fromBuffer(witness.toBuffer());
    expect(deserialized).toEqual(witness);
  });
});

/**
 * Factory function to create a PublicDataWitness based on given seed.
 * @param seed - A seed used to derive all parameters.
 * @returns A new instance of PublicDataWitness.
 */
function makePublicDataWitness(seed: number): PublicDataWitness {
  const leafPreimage = new PublicDataTreeLeafPreimage(
    new Fr(seed + 1),
    new Fr(seed + 2),
    new Fr(seed + 3),
    BigInt(seed + 4),
  );
  const siblingPath = new SiblingPath(
    PUBLIC_DATA_TREE_HEIGHT,
    Array.from({ length: PUBLIC_DATA_TREE_HEIGHT }, (_, i) => toBufferBE(BigInt(seed + i + 6), 32)),
  );

  return new PublicDataWitness(BigInt(seed + 5), leafPreimage, siblingPath);
}
