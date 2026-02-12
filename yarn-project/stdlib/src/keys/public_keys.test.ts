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
      `"0x056998309f6c119e4d753e404f94fef859dddfa530a9379634ceb0854b29bf7a"`,
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
      `"0x023547e676dba19784188825b901a0e70d8ad978300d21d6185a54281b734da0"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'test_data_default_hash',
      hash.toString(),
    );
  });
});
