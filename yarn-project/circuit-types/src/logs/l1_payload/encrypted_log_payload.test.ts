import {
  AztecAddress,
  CompleteAddress,
  IndexedTaggingSecret,
  KeyValidationRequest,
  type PrivateLog,
  computeAddressSecret,
  computeOvskApp,
  deriveKeys,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { EncryptedLogPayload } from './encrypted_log_payload.js';

// placeholder value until tagging is implemented
const PLACEHOLDER_TAG = new Fr(33);

describe('EncryptedLogPayload', () => {
  describe('encrypt and decrypt a full log', () => {
    let completeAddress: CompleteAddress;
    let ovskM: GrumpkinScalar;
    let ivskM: GrumpkinScalar;

    let original: EncryptedLogPayload;
    let payload: PrivateLog;

    beforeAll(() => {
      const incomingBodyPlaintext = randomBytes(128);
      const contract = AztecAddress.random();
      original = new EncryptedLogPayload(PLACEHOLDER_TAG, contract, incomingBodyPlaintext);

      const secretKey = Fr.random();
      const partialAddress = Fr.random();
      ({ masterOutgoingViewingSecretKey: ovskM, masterIncomingViewingSecretKey: ivskM } = deriveKeys(secretKey));

      completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, partialAddress);

      const ovKeys = getKeyValidationRequest(ovskM, contract);

      const ephSk = GrumpkinScalar.random();

      payload = original.generatePayload(ephSk, completeAddress.address, ovKeys);
    });

    it('decrypt a log as incoming', () => {
      const addressSecret = computeAddressSecret(completeAddress.getPreaddress(), ivskM);

      const recreated = EncryptedLogPayload.decryptAsIncoming(payload, addressSecret);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = EncryptedLogPayload.decryptAsOutgoing(payload, ovskM);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });
  });

  it('outgoing cipher text matches Noir', () => {
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

    const addressPoint = recipient.toAddressPoint();

    const outgoingBodyCiphertext = EncryptedLogPayload.encryptOutgoingBody(
      ephSk,
      ephPk,
      recipient,
      addressPoint,
      senderOvskApp,
    ).toString('hex');

    expect(outgoingBodyCiphertext).toMatchInlineSnapshot(
      `"61dd35a8f238d9b8727f89621f3f56b38bc6a2a2d89effcd5ad48d3709f50692ca898124be1f115997cb2bc4cbe9b24fca46fab612bf4f2acdcc910e0d23ff8b8e42c1f0afe9b42599eb2958e834ebd5321a99e319f2a15c2d98646a1dc08365797e1f76bf5aee2b18523112c76b5307"`,
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

    // We set a random secret, as it is simply the result of an oracle call, and we are not actually computing this in nr.
    const logTag = new IndexedTaggingSecret(new Fr(69420), 1337).computeTag(
      AztecAddress.fromBigInt(0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70cn),
    );
    const log = new EncryptedLogPayload(logTag, contract, plaintext);

    const ovskM = new GrumpkinScalar(0x1d7f6b3c491e99f32aad05c433301f3a2b4ed68de661ff8255d275ff94de6fc4n);
    const ovKeys = getKeyValidationRequest(ovskM, contract);

    const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

    const recipientCompleteAddress = CompleteAddress.fromString(
      '0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c138af8799f2fba962549802469e12e3b7ba4c5f9c999c6421e05c73f45ec68481970dd8ce0250b677759dfc040f6edaf77c5827a7bcd425e66bcdec3fa7e59bc18dd22d6a4032eefe3a7a55703f583396596235f7c186e450c92981186ee74042e49e00996565114016a1a478309842ecbaf930fb716c3f498e7e10370631d7507f696b8b233de2c1935e43c793399586f532da5ff7c0356636a75acb862e964156e8a3e42bfca3663936ba98c7fd26386a14657c23b5f5146f1a94b6c4651542685ea16f17c580a7cc7c8ff2688dce9bde8bf1f50475f4c3281e1c33404ee0025f50db0733f719462b22eff03cec746bb9e3829ae3636c84fbccd2754b5a5a92087a5f41ccf94a03a2671cd341ba3264c45147e75d4ea96e3b1a58498550b89',
    );

    const fixedRand = (len: number) => {
      // The random values in the noir test file after the overhead are filled with 1s.
      return Buffer.from(Array(len).fill(1));
    };

    const payload = log.generatePayload(ephSk, recipientCompleteAddress.address, ovKeys, fixedRand);

    expect(payload.toBuffer().toString('hex')).toMatchInlineSnapshot(
      `"0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c36008d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701f00a70577790aeabcc2d81ec8d0c99e7f5d2bf2f1452025dc777a178404f851d9003de818923f85187871d99bdf95d695eff0a9e09ba15153fc9b4d224b6e1e7100dfbdcaab06c09d5b3c749bfebe1c0407eccd04f51bbb59142680c8a091b97f00c6cbcf615def593ab09e5b3f7f58f6fc235c90e7c77ed8dadb3b05ee4545a700bc612c9139475fee6070be47efcc43a5cbbc873632f1428fac952df9c181db005f9e850b21fe11fedef37b88caee95111bce776e488df219732d0a77d19201007047186f41445ecd5c603487f7fb3c8f31010a22af69ce00000000000000000000000000000000a600a61f7d59eeaf52eb51bc0592ff981d9ba3ea8e6ea8ba009dc0cec8c70b81e84556a77ce6c3ca47a527f99ffe7b2524bb885a23020b720095748ad19c1083618ad96298b76ee07eb1a56d19cc798710e9f5de96501bd5009b3781c9c02a6c95c5912f8936b1500d362afbf0922c85b1ada18db8b9516200a6e9d067655cdf669eb387f8e0492a95fdcdb39429d5340b4bebc250ba9bf6002c2f49f549f37beed75a668aa51967e0e57547e5a655157bcf381e22f30e2500881548ec9606a151b5fbfb2d14ee4b34bf4c1dbd71c7be15ad4c63474bb6f8009970aeb3d9489c8edbdff80a1a3a5c28370e534abc870a85ea4318326ea1920022fb10df358c765edada497db4284ae30507a2e03e983d23cfa0bd831577e8"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    const fieldArrayStr = `[${payload.fields.map(f => f.toString()).join(',')}]`;
    updateInlineTestData(
      'noir-projects/aztec-nr/aztec/src/encrypted_logs/payload.nr',
      'private_log_payload_from_typescript',
      fieldArrayStr,
    );

    const ivskM = new GrumpkinScalar(0x0d6e27b21c89a7632f7766e35cc280d43f75bea3898d7328400a5fefc804d462n);

    const addressSecret = computeAddressSecret(recipientCompleteAddress.getPreaddress(), ivskM);
    const recreated = EncryptedLogPayload.decryptAsIncoming(payload, addressSecret);
    expect(recreated?.toBuffer()).toEqual(log.toBuffer());
  });

  const getKeyValidationRequest = (ovskM: GrumpkinScalar, app: AztecAddress) => {
    const ovskApp = computeOvskApp(ovskM, app);
    const ovpkM = derivePublicKeyFromSecretKey(ovskM);

    return new KeyValidationRequest(ovpkM, ovskApp);
  };
});
