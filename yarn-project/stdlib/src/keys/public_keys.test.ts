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
    const keys = new PublicKeys(new Fr(11n), new PublicKey(new Fr(3n), new Fr(4n)), new Fr(22n), new Fr(33n));

    const hash = await keys.hash();
    expect(hash.toString()).toMatchInlineSnapshot(
      `"0x0b8c7b67576d3ac859a7fab578b2b2e305c67eba9e133b0fa46af8d19a50b8fc"`,
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
      `"0x147a900f3e1abdfcc56355d65ab9bebb1016400cb9d81ee1c977d0df16bb198c"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'test_data_default_hash',
      hash.toString(),
    );
  });
});
