import { Fr, Point } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { PublicKeys } from '../types/public_keys.js';
import { computeAddress, computePreaddress } from './derivation.js';

// TODO: Why are snapshots not matching in CI?
describe.skip('🔑', () => {
  it('computing public keys hash matches Noir', () => {
    const masterNullifierPublicKey = new Point(new Fr(1), new Fr(2), false);
    const masterIncomingViewingPublicKey = new Point(new Fr(3), new Fr(4), false);
    const masterOutgoingViewingPublicKey = new Point(new Fr(5), new Fr(6), false);
    const masterTaggingPublicKey = new Point(new Fr(7), new Fr(8), false);

    const expected = Fr.fromHexString('0x0fecd9a32db731fec1fded1b9ff957a1625c069245a3613a2538bd527068b0ad');
    expect(
      new PublicKeys(
        masterNullifierPublicKey,
        masterIncomingViewingPublicKey,
        masterOutgoingViewingPublicKey,
        masterTaggingPublicKey,
      ).hash(),
    ).toEqual(expected);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'expected_public_keys_hash',
      expected.toString(),
    );
  });

  it('Pre address from partial matches Noir', () => {
    const publicKeysHash = new Fr(1n);
    const partialAddress = new Fr(2n);
    const address = computePreaddress(publicKeysHash, partialAddress).toString();
    expect(address).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/aztec_address.nr',
      'expected_computed_preaddress_from_partial_and_pubkey',
      address.toString(),
    );
  });

  it('Address matches Noir', () => {
    const npkM = Point.fromString(
      '0x22f7fcddfa3ce3e8f0cc8e82d7b94cdd740afa3e77f8e4a63ea78a239432dcab0471657de2b6216ade6c506d28fbc22ba8b8ed95c871ad9f3e3984e90d9723a7',
    );
    const ivpkM = Point.fromString(
      '0x111223493147f6785514b1c195bb37a2589f22a6596d30bb2bb145fdc9ca8f1e273bbffd678edce8fe30e0deafc4f66d58357c06fd4a820285294b9746c3be95',
    );
    const ovpkM = Point.fromString(
      '0x09115c96e962322ffed6522f57194627136b8d03ac7469109707f5e44190c4840c49773308a13d740a7f0d4f0e6163b02c5a408b6f965856b6a491002d073d5b',
    );
    const tpkM = Point.fromString(
      '0x00d3d81beb009873eb7116327cf47c612d5758ef083d4fda78e9b63980b2a7622f567d22d2b02fe1f4ad42db9d58a36afd1983e7e2909d1cab61cafedad6193a',
    );

    const publicKeys = new PublicKeys(npkM, ivpkM, ovpkM, tpkM);

    const partialAddress = Fr.fromHexString('0x0a7c585381b10f4666044266a02405bf6e01fa564c8517d4ad5823493abd31de');

    const address = computeAddress(publicKeys, partialAddress).toString();
    expect(address).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/aztec_address.nr',
      'expected_computed_address_from_partial_and_pubkeys',
      address.toString(),
    );
  });
});
