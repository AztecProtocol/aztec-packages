import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { PublicKeys } from './public_keys.js';

describe('PublicKeys', () => {
  it('serialization and deserialization', async () => {
    const pk = await PublicKeys.random();
    const serialized = pk.toString();
    const deserialized = PublicKeys.fromString(serialized);
    expect(pk).toEqual(deserialized);
    const serializedWithoutPrefix = serialized.slice(2);
    const deserializedWithoutPrefix = PublicKeys.fromString(serializedWithoutPrefix);
    expect(pk).toEqual(deserializedWithoutPrefix);
  });
  it('computes public keys hash', async () => {
    const keys = new PublicKeys(
      new Point(new Fr(1n), new Fr(2n), false),
      new Point(new Fr(3n), new Fr(4n), false),
      new Point(new Fr(5n), new Fr(6n), false),
      new Point(new Fr(7n), new Fr(8n), false),
    );
    const hash = await keys.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x14347f1d74d892ce45384ca5b69c2070d264e64458ef327ab7b42c850a3d437f"`,
    );
    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'expected_public_keys_hash',
      hash.toString(),
    );
  });
  it('computes default keys hash', async () => {
    const keys = PublicKeys.default();
    const hash = await keys.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x20c0a5f4c7c5bd4e0f9e7cdb69d16fcb9115d2a77d83701be26f31dde1b3c92e"`,
    );
    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'test_data_default_hash',
      hash.toString(),
    );
  });
});
