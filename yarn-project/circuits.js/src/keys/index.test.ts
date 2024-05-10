import { Fr, Point } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { computeAddress, computePublicKeysHash } from './index.js';

describe('🔑', () => {
  it('computing public keys hash matches Noir', () => {
    const masterNullifierPublicKey = new Point(new Fr(1), new Fr(2));
    const masterIncomingViewingPublicKey = new Point(new Fr(3), new Fr(4));
    const masterOutgoingViewingPublicKey = new Point(new Fr(5), new Fr(6));
    const masterTaggingPublicKey = new Point(new Fr(7), new Fr(8));

    const expected = Fr.fromString('0x1936abe4f6a920d16a9f6917f10a679507687e2cd935dd1f1cdcb1e908c027f3');
    expect(
      computePublicKeysHash(
        masterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
      ),
    ).toEqual(expected);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/public_keys_hash.nr',
      'expected_public_keys_hash',
      expected.toString(),
    );
  });

  it('Address from partial matches Noir', () => {
    const publicKeysHash = new Fr(1n);
    const partialAddress = new Fr(2n);
    const address = computeAddress(publicKeysHash, partialAddress).toString();
    expect(address).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/aztec_address.nr',
      'expected_computed_address_from_partial_and_pubkey',
      address.toString(),
    );
  });
});
