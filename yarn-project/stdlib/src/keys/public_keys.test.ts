import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { PublicKey } from './public_key.js';
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
      new Fr(11n),
      new PublicKey(new Fr(3n), new Fr(4n)),
      new Fr(22n),
      new Fr(33n),
      new Fr(44n),
      new Fr(55n),
    );

    const hash = await keys.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x1e57c605207e2b607720b8e3023f69f5af25683277db5ff3b99f7948213c7878"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'expected_public_keys_hash',
      hash.toString(),
    );
  });

  it('computes default keys hash', async () => {
    const keys = PublicKeys.default();

    const hash = await keys.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x13c13fbec22a396f700180c621fb8c67b830b431fed47d4dd71a20d828829eaa"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/fnd/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'test_data_default_hash',
      hash.toString(),
    );
  });
});
