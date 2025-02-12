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
      const contractAddress = await AztecAddress.random();

      original = new EncryptedLogPayload(PLACEHOLDER_TAG, contractAddress, incomingBodyPlaintext);

      const secretKey = Fr.random();
      const partialAddress = Fr.random();
      ({ masterIncomingViewingSecretKey: ivskM } = await deriveKeys(secretKey));

      completeAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, partialAddress);

      const ephSk = GrumpkinScalar.random();

      payload = await original.generatePayload(ephSk, completeAddress.address);
    });

    it('decrypt a log as incoming', async () => {
      const addressSecret = await computeAddressSecret(await completeAddress.getPreaddress(), ivskM);

      const recreated = await EncryptedLogPayload.decryptAsIncoming(payload.fields, addressSecret);

      expect(recreated?.toBuffer()).toEqual(original.toBuffer());
    });
  });

  it('encrypted tagged log matches Noir', async () => {
    // All the values in this test were arbitrarily set and copied over to `payload.nr`
    const contractAddress = AztecAddress.fromString(
      '0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04',
    );

    // This plaintext is taken from a MockNote, created in the corresponding noir test in aztec-packages/noir-projects/aztec-nr/aztec/src/encrypted_logs/log_assembly_strategies/default_aes128/note.nr.
    // storage slot = 42 = 0x2a
    // note_type_id = 76 = 0x4c
    // value = 1234 = 0x04d2
    const plaintext = Buffer.from(
      '000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000004c00000000000000000000000000000000000000000000000000000000000004d2',
      'hex',
    );

    // We set a random secret, as it is simply the result of an oracle call, and we are not actually computing this in nr.
    const logTag = await new IndexedTaggingSecret(new Fr(69420), 1337).computeTag(
      AztecAddress.fromBigInt(0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70cn),
    );
    const log = new EncryptedLogPayload(logTag, contractAddress, plaintext);

    const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

    const recipientCompleteAddress = await CompleteAddress.fromString(
      '0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c138af8799f2fba962549802469e12e3b7ba4c5f9c999c6421e05c73f45ec68481970dd8ce0250b677759dfc040f6edaf77c5827a7bcd425e66bcdec3fa7e59bc18dd22d6a4032eefe3a7a55703f583396596235f7c186e450c92981186ee74042e49e00996565114016a1a478309842ecbaf930fb716c3f498e7e10370631d7507f696b8b233de2c1935e43c793399586f532da5ff7c0356636a75acb862e964156e8a3e42bfca3663936ba98c7fd26386a14657c23b5f5146f1a94b6c4651542685ea16f17c580a7cc7c8ff2688dce9bde8bf1f50475f4c3281e1c33404ee0025f50db0733f719462b22eff03cec746bb9e3829ae3636c84fbccd2754b5a5a92087a5f41ccf94a03a2671cd341ba3264c45147e75d4ea96e3b1a58498550b89',
    );

    const fixedRand = (len: number) => {
      // The random values in the noir test file after the overhead are filled with 1s.
      return Buffer.from(Array(len).fill(1));
    };

    const payload = await log.generatePayload(ephSk, recipientCompleteAddress.address, fixedRand);

    expect(payload.toBuffer().toString('hex')).toMatchInlineSnapshot(
      `"0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c360d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa7000194e6d7872db8f61e8e59f23580f4db45d13677f873ec473a409cf61fd04d00334e5fb6083721f3eb4eef500876af3c9acfab0a1cb1804b930606fdb0b28300af91db798fa320746831a59b74362dfd0cf9e7c239f6aad11a4b47d0d870ee00d25a054613a83be7be8512f2c09664bc4f7ab60a127b06584f476918581b8a003840d100d8c1d78d4b68b787ed353ebfb8cd2987503d3b472f614f25799a18003f38322629d4010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101"`,
    );

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    const fieldArrayStr = `[${payload.fields.map(f => f.toString()).join(',')}]`;
    updateInlineTestData(
      'noir-projects/aztec-nr/aztec/src/encrypted_logs/log_assembly_strategies/default_aes128/note.nr',
      'private_log_payload_from_typescript',
      fieldArrayStr,
    );

    const ivskM = new GrumpkinScalar(0x0d6e27b21c89a7632f7766e35cc280d43f75bea3898d7328400a5fefc804d462n);

    const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
    const recreated = await EncryptedLogPayload.decryptAsIncoming(payload.fields, addressSecret);
    expect(recreated?.toBuffer()).toEqual(log.toBuffer());
  });
});
