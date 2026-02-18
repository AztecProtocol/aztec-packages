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
  it('leaf hash matches noir', () => {
    const leaf = new PublicDataTreeLeaf(new Fr(123), new Fr(45));
    const preimage = new PublicDataTreeLeafPreimage(leaf, new Fr(67), 890n);
    const hash = preimage.hash();
    expect(hash).toMatchInlineSnapshot(`"0x0340f9812bf42e644e888bd04dae1a6f53a0f3fb89e9e7dea5dfb8bae470c5dc"`);
    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/data/public_data_tree_leaf_preimage.nr',
      'hash_from_ts',
      hash.toString(),
    );
  });
});
