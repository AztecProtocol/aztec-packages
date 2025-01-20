import {
  AztecAddress,
  CompleteAddress,
  IndexedTaggingSecret,
  type PrivateLog,
  computeAddressSecret,
  deriveKeys,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { EncryptedLogPayload } from './encrypted_log_payload.js';

// placeholder value until tagging is implemented
const PLACEHOLDER_TAG = new Fr(33);

describe('EncryptedLogPayload', () => {
  describe('encrypt and decrypt a full log', () => {
    let completeAddress: CompleteAddress;
    let ivskM: GrumpkinScalar;

    let original: EncryptedLogPayload;
    let payload: PrivateLog;

    beforeAll(async () => {
      const incomingBodyPlaintext = randomBytes(128);
      const contract = await AztecAddress.random();
      original = new EncryptedLogPayload(PLACEHOLDER_TAG, contract, incomingBodyPlaintext);

      const secretKey = Fr.random();
      const partialAddress = Fr.random();
      ({ masterIncomingViewingSecretKey: ivskM } = deriveKeys(secretKey));

      completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, partialAddress);

      const ephSk = GrumpkinScalar.random();

      payload = await original.generatePayload(ephSk, completeAddress.address);
    });

    it('decrypt a log as incoming', async () => {
      const addressSecret = computeAddressSecret(completeAddress.getPreaddress(), ivskM);

      const recreated = await EncryptedLogPayload.decryptAsIncoming(payload, addressSecret);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });
  });

  it('encrypted tagged log matches Noir', async () => {
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

    const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

    const recipientCompleteAddress = CompleteAddress.fromString(
      '0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c138af8799f2fba962549802469e12e3b7ba4c5f9c999c6421e05c73f45ec68481970dd8ce0250b677759dfc040f6edaf77c5827a7bcd425e66bcdec3fa7e59bc18dd22d6a4032eefe3a7a55703f583396596235f7c186e450c92981186ee74042e49e00996565114016a1a478309842ecbaf930fb716c3f498e7e10370631d7507f696b8b233de2c1935e43c793399586f532da5ff7c0356636a75acb862e964156e8a3e42bfca3663936ba98c7fd26386a14657c23b5f5146f1a94b6c4651542685ea16f17c580a7cc7c8ff2688dce9bde8bf1f50475f4c3281e1c33404ee0025f50db0733f719462b22eff03cec746bb9e3829ae3636c84fbccd2754b5a5a92087a5f41ccf94a03a2671cd341ba3264c45147e75d4ea96e3b1a58498550b89',
    );

    const fixedRand = (len: number) => {
      // The random values in the noir test file after the overhead are filled with 1s.
      return Buffer.from(Array(len).fill(1));
    };

    const payload = await log.generatePayload(ephSk, recipientCompleteAddress.address, fixedRand);

    expect(payload.toBuffer().toString('hex')).toMatchInlineSnapshot(
      `"0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c36008d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701f00a70577790aeabcc2d81ec8d0c99e7f5d2bf2f1452025dc777a178404f851d9003de818923f85187871d99bdf95d695eff0a900000000000000000000000000000000a600a61f7d59eeaf52eb51bc0592ff981d9ba3ea8e6ea8ba9dc0cec8c7000b81e84556a77ce6c3ca47a527f99ffe7b2524bb885a23020b7295748ad19c001083618ad96298b76ee07eb1a56d19cc798710e9f5de96501bd59b3781c9c0002a6c95c5912f8936b1500d362afbf0922c85b1ada18db8b95162a6e9d06765005cdf669eb387f8e0492a95fdcdb39429d5340b4bebc250ba9bf62c2f49f54900f37beed75a668aa51967e0e57547e5a655157bcf381e22f30e25881548ec960006a151b5fbfb2d14ee4b34bf4c1dbd71c7be15ad4c63474bb6f89970aeb3d900489c8edbdff80a1a3a5c28370e534abc870a85ea4318326ea19222fb10df35008c765edada497db4284ae30507a2e03e983d23cfa0bd831577e857bbef9cf70090c97cb5699cc8783a1b4276d929be2882e5b9b72829a4f8404f7e3c853d1100d6d5a000b80134891e95f81007ad35d3945eaeecbe137fff85d01d7eaf8f1900a15eb965c6a4bc97aa87fd3463c31c9d4e0d722a8ba870bcc50c9c7a8b48ad0063c861bdbe490d44c57382decbae663927909652f87ac18dcfd5b30649cce500820f14caa725efe1fa3485ceac88499eadf0565c5b20998c05931bbf478e68"`,
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
    const recreated = await EncryptedLogPayload.decryptAsIncoming(payload, addressSecret);
    expect(recreated?.toBuffer()).toEqual(log.toBuffer());
  });
});
