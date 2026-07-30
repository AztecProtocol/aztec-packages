import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from './public_data_leaf.js';

describe('PublicDataTreeLeaf', () => {
  it('serializes and deserializes a leaf', () => {
    const leaf = new PublicDataTreeLeaf(Fr.random(), Fr.random());
    const buffer = leaf.toBuffer();
    const deserialized = PublicDataTreeLeaf.fromBuffer(buffer);
    expect(deserialized).toEqual(leaf);
  });

  it('leaf hash matches noir', async () => {
    const leaf = new PublicDataTreeLeaf(new Fr(123), new Fr(45));
    const preimage = new PublicDataTreeLeafPreimage(leaf, new Fr(67), 890n);
    const hash = await preimage.hash();
    expect(hash).toMatchInlineSnapshot('"0x2efdfcfc865cbb7543183fae69374ee5106dde9741545afd2fbf12868b550614"');

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/data/public_data_tree_leaf_preimage.nr',
      'hash_from_ts',
      hash.toString(),
    );
  });
});
