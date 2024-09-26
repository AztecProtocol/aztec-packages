import { AztecAddress, KeyValidationRequest, computeOvskApp, derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { L2Log } from './l2_log.js';

// placeholder value until tagging is implemented
const PLACEHOLDER_TAG = new Fr(33);

describe('L2 Log', () => {
  describe('encrypt and decrypt a full log', () => {
    let ovskM: GrumpkinScalar;
    let ivskM: GrumpkinScalar;

    let original: L2Log;
    let encrypted: Buffer;

    beforeAll(() => {
      const incomingBodyPlaintext = randomBytes(128);
      const contract = AztecAddress.random();
      original = new L2Log(PLACEHOLDER_TAG, PLACEHOLDER_TAG, contract, incomingBodyPlaintext);

      ovskM = GrumpkinScalar.random();
      ivskM = GrumpkinScalar.random();

      const ovKeys = getKeyValidationRequest(ovskM, contract);

      const ephSk = GrumpkinScalar.random();

      const recipientAddress = AztecAddress.random();
      const ivpk = derivePublicKeyFromSecretKey(ivskM);

      encrypted = original.encrypt(ephSk, recipientAddress, ivpk, ovKeys);
    });

    it('decrypt a log as incoming', () => {
      const recreated = L2Log.decryptAsIncoming(encrypted, ivskM);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = L2Log.decryptAsOutgoing(encrypted, ovskM);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });
  });

  it('encrypted tagged log matches Noir', () => {
    // All the values in this test were arbitrarily set and copied over to `payload.nr`
    const contract = AztecAddress.fromString('0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04');
    const plaintext = Buffer.from(
      '00000001301640ceea758391b2e161c92c0513f129020f4125256afdae2646ce31099f5c10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e040fe46be583b71f4ab5b70c2657ff1d05cccf1d292a9369628d1a194f944e659900001027',
      'hex',
    );
    const log = new L2Log(new Fr(0), new Fr(0), contract, plaintext);

    const ovskM = new GrumpkinScalar(0x06b76394ac57b8a18ceb08b14ed15b5b778d5c506b4cfb7edc203324eab27c05n);
    const ivskM = new GrumpkinScalar(0x03fd94b1101e834e829cda4f227043f60490b5c7b3073875f5bfbe5028ed05ccn);
    const ovKeys = getKeyValidationRequest(ovskM, contract);
    const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

    const recipientAddress = AztecAddress.fromString(
      '0x10ee41ee4b62703b16f61e03cb0d88c4b306a9eb4a6ceeb2aff13428541689a2',
    );

    const ivpk = derivePublicKeyFromSecretKey(ivskM);

    const encrypted = log.encrypt(ephSk, recipientAddress, ivpk, ovKeys).toString('hex');

    expect(encrypted).toMatchInlineSnapshot(
      `"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa77e4f33ba2f47fdac6370f13bc5f16bbae857bbe6ab3ee4ea2a339192eef22a47ce0df4426fc314cb6294ccf291b79c1d8d362cdcc223e51020ccd3318e7052ca74f1fe922ad914bd46e4b6abcd681b63ab1c5bf4151e82f00548ae7c61c59df8c117c14c2e8d9046d32d43a7da818c68be296ef9d1446a87a450eb3f6550200d2663915b0bad97e7f7419975e5a740efb67eeb5304a90808a004ebfc156054a1459191d7fea175f6c64159b3c25a13790cca7250c30e3c80698e64565a6c9ddb16ac1479c3199fec02464b2a252202119514b02012cc387579220f03587b40444ae93f3b83dec2c0a76ed90a804981ac3d2b0c62a5cbbf9aa19604ef5f303c9f21de8e6649c1ec91c5a0d8fe71f319f4fbc0de230772652398977018205e8a47a05b4483d9758c139325c5c0152bacefefcd0f6e4c1ad32a75040f8791f7254954a495fa2300cd69b28f686264fac19a88afb16de1cffc93fafabd759365e684"`,
    );

    const byteArrayString = `[${encrypted.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/aztec-nr/aztec/src/encrypted_logs/payload.nr',
      'encrypted_log_from_typescript',
      byteArrayString,
    );
  });

  const getKeyValidationRequest = (ovskM: GrumpkinScalar, app: AztecAddress) => {
    const ovskApp = computeOvskApp(ovskM, app);
    const ovpkM = derivePublicKeyFromSecretKey(ovskM);

    return new KeyValidationRequest(ovpkM, ovskApp);
  };
});
