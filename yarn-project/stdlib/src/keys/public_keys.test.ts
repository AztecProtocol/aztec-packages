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
      `"0x029d92319623fe2e5804a64b35d13e1c4881045371c41f36329b44dfc237d232"`,
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
      `"0x1d631c5b105baebd0f480f04e79aef2a800d6cc5e3814b92cec83034cf9b959e"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'test_data_default_hash',
      hash.toString(),
    );
  });
});
