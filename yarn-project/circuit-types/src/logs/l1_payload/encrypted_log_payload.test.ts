import {
  AztecAddress,
  CompleteAddress,
  KeyValidationRequest,
  computeAddressSecret,
  computeOvskApp,
  computePoint,
  deriveKeys,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { EncryptedLogPayload } from './encrypted_log_payload.js';
import { encrypt } from './encryption_util.js';
import { derivePoseidonAESSecret } from './shared_secret_derivation.js';

// placeholder value until tagging is implemented
const PLACEHOLDER_TAG = new Fr(33);

describe('EncryptedLogPayload', () => {
  describe('encrypt and decrypt a full log', () => {
    let completeAddress: CompleteAddress;
    let ovskM: GrumpkinScalar;
    let ivskM: GrumpkinScalar;

    let original: EncryptedLogPayload;
    let encrypted: Buffer;

    beforeAll(() => {
      const incomingBodyPlaintext = randomBytes(128);
      const contract = AztecAddress.random();
      original = new EncryptedLogPayload(PLACEHOLDER_TAG, PLACEHOLDER_TAG, contract, incomingBodyPlaintext);

      const secretKey = Fr.random();
      const partialAddress = Fr.random();
      ({ masterOutgoingViewingSecretKey: ovskM, masterIncomingViewingSecretKey: ivskM } = deriveKeys(secretKey));

      completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, partialAddress);

      const ovKeys = getKeyValidationRequest(ovskM, contract);

      const ephSk = GrumpkinScalar.random();

      encrypted = original.encrypt(ephSk, completeAddress.address, computePoint(completeAddress.address), ovKeys);
    });

    it('decrypt a log as incoming', () => {
      const addressSecret = computeAddressSecret(completeAddress.getPreaddress(), ivskM);

      const recreated = EncryptedLogPayload.decryptAsIncoming(encrypted, addressSecret);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = EncryptedLogPayload.decryptAsOutgoing(encrypted, ovskM);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });
  });

  it('outgoing ciphertest matches Noir', () => {
    const ephSk = GrumpkinScalar.fromHighLow(
      new Fr(0x000000000000000000000000000000000f096b423017226a18461115fa8d34bbn),
      new Fr(0x00000000000000000000000000000000d0d302ee245dfaf2807e604eec4715fen),
    );

    const senderOvskApp = GrumpkinScalar.fromHighLow(
      new Fr(0x00000000000000000000000000000000089c6887cb1446d86c64e81afc78048bn),
      new Fr(0x0000000000000000000000000000000074d2e28c6bc5176ac02cf7c7d36a444en),
    );

    const ephPk = derivePublicKeyFromSecretKey(ephSk);

    const recipient = AztecAddress.fromBigInt(0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70cn);

    const outgoingBodyPlaintext = serializeToBuffer(
      ephSk.hi,
      ephSk.lo,
      recipient,
      computePoint(recipient).toCompressedBuffer(),
    );
    const outgoingBodyCiphertext = encrypt(
      outgoingBodyPlaintext,
      senderOvskApp,
      ephPk,
      derivePoseidonAESSecret,
    ).toString('hex');

    expect(outgoingBodyCiphertext).toMatchInlineSnapshot(
      `"7fb6e34bc0c5362fa886e994fb2e560c4932ee321fae1bca6e4da1c5f47c11648f96e80e9cf82bb11052f467584a54c80f41bb0ea33c5b16681fd3be7c794f5ceeb6c2e1224743741be744a1935e35c353edac34ade51aea6b2b52441069257d75568532155c4ae5698d53e5fffb153dea3da8dd6ae70849d03cfb2efbe49490bbc32612df990879b254ed94fedb3b3e"`,
    );

    const byteArrayString = `[${outgoingBodyCiphertext.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/aztec-nr/aztec/src/encrypted_logs/payload.nr',
      'outgoing_body_ciphertext_from_typescript',
      byteArrayString,
    );
  });

  it('encrypted tagged log matches Noir', () => {
    // All the values in this test were arbitrarily set and copied over to `payload.nr`
    const contract = AztecAddress.fromString('0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04');
    const plaintext = Buffer.from(
      '00000001301640ceea758391b2e161c92c0513f129020f4125256afdae2646ce31099f5c10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e040fe46be583b71f4ab5b70c2657ff1d05cccf1d292a9369628d1a194f944e659900001027',
      'hex',
    );
    const log = new EncryptedLogPayload(new Fr(0), new Fr(0), contract, plaintext);

    const ovskM = new GrumpkinScalar(0x1d7f6b3c491e99f32aad05c433301f3a2b4ed68de661ff8255d275ff94de6fc4n);
    const ovKeys = getKeyValidationRequest(ovskM, contract);

    const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

    const recipientCompleteAddress = CompleteAddress.fromString(
      '0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c138af8799f2fba962549802469e12e3b7ba4c5f9c999c6421e05c73f45ec68481970dd8ce0250b677759dfc040f6edaf77c5827a7bcd425e66bcdec3fa7e59bc18dd22d6a4032eefe3a7a55703f583396596235f7c186e450c92981186ee74042e49e00996565114016a1a478309842ecbaf930fb716c3f498e7e10370631d7507f696b8b233de2c1935e43c793399586f532da5ff7c0356636a75acb862e964156e8a3e42bfca3663936ba98c7fd26386a14657c23b5f5146f1a94b6c4651542685ea16f17c580a7cc7c8ff2688dce9bde8bf1f50475f4c3281e1c33404ee0025f50db0733f719462b22eff03cec746bb9e3829ae3636c84fbccd2754b5a5a92087a5f41ccf94a03a2671cd341ba3264c45147e75d4ea96e3b1a58498550b89',
    );

    const encrypted = log
      .encrypt(ephSk, recipientCompleteAddress.address, computePoint(recipientCompleteAddress.address), ovKeys)
      .toString('hex');
    expect(encrypted).toMatchInlineSnapshot(
      `"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa70577790aeabcc2d81ec8d0c99e7f5d2bf2f1452025dc777a178404f851d93de818923f85187871d99bdf95d695eff0a9e09ba15153fc9b4d224b6e1e71dfbdcaab06c09d5b3c749bfebe1c0407eccd04f51bbb59142680c8a091b97fc6cbcf61f6c2af9b8ebc8f78537ab23fd0c5e818e4d42d459d265adb77c2ef829bf68f87f2c47b478bb57ae7e41a07643f65c353083d557b94e31da4a2a13127498d2eb3f0346da5eed2e9bc245aaf022a954ed0b09132b498f537702899b44e3666776238ebf633b3562d7f124dbba82918e871958a94218fd796bc6983feecc7ce382c82861d63fe45999244ea9494b226ddb694b2640dce005b473acf1ae3be158f558ad1ca228e9f793d09390230a2597e0e53ad28f7aa9a700ccc302607ad6c26ea1410735b6a8c793f6317f7009409a3912b15ee2f28ccf17cf6c94b720301e5c5826de39e85bc7db3dc33aa79afcaf325670d1b359d08b10bd07840d394c9f038"`,
    );

    const byteArrayString = `[${encrypted.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/aztec-nr/aztec/src/encrypted_logs/payload.nr',
      'encrypted_log_from_typescript',
      byteArrayString,
    );

    const ivskM = new GrumpkinScalar(0x0d6e27b21c89a7632f7766e35cc280d43f75bea3898d7328400a5fefc804d462n);

    const addressSecret = computeAddressSecret(recipientCompleteAddress.getPreaddress(), ivskM);
    const recreated = EncryptedLogPayload.decryptAsIncoming(Buffer.from(encrypted, 'hex'), addressSecret);
    expect(recreated?.toBuffer()).toEqual(log.toBuffer());
  });

  const getKeyValidationRequest = (ovskM: GrumpkinScalar, app: AztecAddress) => {
    const ovskApp = computeOvskApp(ovskM, app);
    const ovpkM = derivePublicKeyFromSecretKey(ovskM);

    return new KeyValidationRequest(ovpkM, ovskApp);
  };
});
