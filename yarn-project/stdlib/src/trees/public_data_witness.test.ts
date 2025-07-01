import { PUBLIC_DATA_TREE_HEIGHT } from '@aztec/constants';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { randomInt } from '@aztec/foundation/crypto';
import { SiblingPath } from '@aztec/foundation/trees';

import { makePublicDataTreeLeafPreimage } from '../tests/factories.js';
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
  const leafPreimage = makePublicDataTreeLeafPreimage(seed);
  const siblingPath = new SiblingPath(
    PUBLIC_DATA_TREE_HEIGHT,
    Array.from({ length: PUBLIC_DATA_TREE_HEIGHT }, (_, i) => toBufferBE(BigInt(seed + i + 6), 32)),
  );

  return new PublicDataWitness(BigInt(seed + 5), leafPreimage, siblingPath);
}
