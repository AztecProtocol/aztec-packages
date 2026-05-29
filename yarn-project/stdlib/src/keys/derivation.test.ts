import { Fr } from '@aztec/foundation/curves/bn254';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { computeAddress, computePreaddress } from './derivation.js';
import { PublicKey, hashPublicKey } from './public_key.js';
import { PublicKeys } from './public_keys.js';

describe('🔑', () => {
  it('computing public keys hash matches Noir', async () => {
    const publicKeysHash = await new PublicKeys(
      new Fr(11n),
      new PublicKey(new Fr(3n), new Fr(4n)),
      new Fr(22n),
      new Fr(33n),
      new Fr(44n),
      new Fr(55n),
    ).hash();
    expect(publicKeysHash.toString()).toMatchInlineSnapshot(
      `"0x1e57c605207e2b607720b8e3023f69f5af25683277db5ff3b99f7948213c7878"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/public_keys.nr',
      'expected_public_keys_hash',
      publicKeysHash.toString(),
    );
  });
  it('Pre address from partial matches Noir', async () => {
    const publicKeysHash = new Fr(1n);
    const partialAddress = new Fr(2n);
    const address = await computePreaddress(publicKeysHash, partialAddress);
    expect(address.toString()).toMatchInlineSnapshot(
      `"0x0fa1c698858df1a99170cd39d5f4bfad6d0d60f1f8afa3dc92281ee60b36f3bb"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/aztec_address.nr',
      'expected_computed_preaddress_from_partial_and_pubkey',
      address.toString(),
    );
  });
  it('Address matches Noir', async () => {
    const npkM = PublicKey.fromString(
      '0x22f7fcddfa3ce3e8f0cc8e82d7b94cdd740afa3e77f8e4a63ea78a239432dcab0471657de2b6216ade6c506d28fbc22ba8b8ed95c871ad9f3e3984e90d9723a7',
    );
    const ivpkM = PublicKey.fromString(
      '0x111223493147f6785514b1c195bb37a2589f22a6596d30bb2bb145fdc9ca8f1e273bbffd678edce8fe30e0deafc4f66d58357c06fd4a820285294b9746c3be95',
    );
    const ovpkM = PublicKey.fromString(
      '0x09115c96e962322ffed6522f57194627136b8d03ac7469109707f5e44190c4840c49773308a13d740a7f0d4f0e6163b02c5a408b6f965856b6a491002d073d5b',
    );
    const tpkM = PublicKey.fromString(
      '0x00d3d81beb009873eb7116327cf47c612d5758ef083d4fda78e9b63980b2a7622f567d22d2b02fe1f4ad42db9d58a36afd1983e7e2909d1cab61cafedad6193a',
    );
    const mspkM = PublicKey.fromString(
      '0x1bd6cb13e0bc8c6e0c1a8b2c5d7f9e0a4b6c8d0e2f4a6c8e0a2c4e6f8a0b2c4d0a032ec7b21c2bdb35f8a13e594764e39ee786c4b275eef3f0435bf6ab2b9822',
    );
    const fbpkM = PublicKey.fromString(
      '0x2c8e0a2c4e6f8b0d2f4a6c8e0a2c4e6f8b0d2f4a6c8e0a2c4e6f8b0d2f4a6c902ef338da3a77e65f90b6d48ac686fc9ff3a95de0c39e0426fc443377425e6634',
    );
    const publicKeys = new PublicKeys(
      await hashPublicKey(npkM),
      ivpkM,
      await hashPublicKey(ovpkM),
      await hashPublicKey(tpkM),
      await hashPublicKey(mspkM),
      await hashPublicKey(fbpkM),
    );
    const partialAddress = Fr.fromHexString('0x0a7c585381b10f4666044266a02405bf6e01fa564c8517d4ad5823493abd31de');
    const address = (await computeAddress(publicKeys, partialAddress)).toString();
    expect(address).toMatchInlineSnapshot(`"0x303ffc8bd456d132463b1fc3a633aeb718a7883c268f3956c05e6fe09b5a5424"`);

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/address/aztec_address.nr',
      'expected_computed_address_from_partial_and_pubkeys',
      address.toString(),
    );
  });
});
