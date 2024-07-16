import { AztecAddress, KeyValidationRequest, computeOvskApp, derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { EventSelector, NoteSelector } from '@aztec/foundation/abi';
import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing';

import { EncryptedL2Log } from '../encrypted_l2_log.js';
import { L1EventPayload } from './l1_event_payload.js';
import { L1NotePayload } from './l1_note_payload.js';
import { Event, Note } from './payload.js';
import { TaggedLog } from './tagged_log.js';

describe('L1 Note Payload', () => {
  it('convert to and from buffer', () => {
    const payload = L1NotePayload.random();
    const taggedLog = new TaggedLog(payload);
    const buf = taggedLog.toBuffer();
    expect(TaggedLog.fromBuffer(buf).payload).toEqual(taggedLog.payload);
  });

  describe('encrypt and decrypt a full log', () => {
    let ovskM: GrumpkinScalar;
    let ivskM: GrumpkinScalar;

    let taggedLog: TaggedLog<L1NotePayload>;
    let encrypted: Buffer;

    beforeAll(() => {
      const payload = L1NotePayload.random();

      ovskM = GrumpkinScalar.random();
      ivskM = GrumpkinScalar.random();

      const ovKeys = getKeyValidationRequest(ovskM, payload.contractAddress);

      const ephSk = GrumpkinScalar.random();

      const recipientAddress = AztecAddress.random();
      const ivpk = derivePublicKeyFromSecretKey(ivskM);

      taggedLog = new TaggedLog(payload);

      encrypted = taggedLog.encrypt(ephSk, recipientAddress, ivpk, ovKeys);
    });

    it('decrypt a log as incoming', () => {
      const recreated = TaggedLog.decryptAsIncoming(encrypted, ivskM);

      expect(recreated?.toBuffer()).toEqual(taggedLog.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = TaggedLog.decryptAsOutgoing(encrypted, ovskM);

      expect(recreated?.toBuffer()).toEqual(taggedLog.toBuffer());
    });

    it.only('encrypt a log outgoing body, generate input for noir test', () => {
      const contract = AztecAddress.fromString('0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04');
      const storageSlot = new Fr(0x0fe46be583b71f4ab5b70c2657ff1d05cccf1d292a9369628d1a194f944e6599n);
      const noteValue = new Fr(0x301640ceea758391b2e161c92c0513f129020f4125256afdae2646ce31099f5cn);
      const noteTypeId = new NoteSelector(0);

      const payload = new L1NotePayload(
        new Note([
          noteValue,
          // storageSlot,
          // noteTypeId.toField(),
          // new Fr(0x171a0c40d0672c1d675ec789f43d7fd5d66f16645f28ab7a7d2070a19ae7f51en),
          // new Fr(0x0b08eccff06dcb1a721a4ec74ed35b3ac6d15423736bf0f672fe897102c6c7b2n),
          // new Fr(0x1a1ae7ec6c9632417e4eece9a8c8eb9e911e0f77fa47dc0e374bb9148292f8c9n),
          // new Fr(0x2bc0c0ce6ce9c5d4692b4d39a57f5ab5fae4875a8cf13276830b7483c3c4ee5bn),
          // new Fr(0x0a9b92d606b3788b858600d91f747e672609cd0598fab931c35b9b9463c24f3cn),
          // new Fr(0x2737fbb2a9ffc3403c111d9ea6546917ace40d246a24bc92f77115ebe02bc912n),
        ]),
        contract,
        storageSlot,
        noteTypeId,
      );

      ovskM = new GrumpkinScalar(0x06b76394ac57b8a18ceb08b14ed15b5b778d5c506b4cfb7edc203324eab27c05n);
      ivskM = new GrumpkinScalar(0x03fd94b1101e834e829cda4f227043f60490b5c7b3073875f5bfbe5028ed05ccn);

      const ovKeys = getKeyValidationRequest(ovskM, payload.contractAddress);

      const ephSk = new GrumpkinScalar(0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538n);

      const recipientAddress = AztecAddress.fromString(
        '0x27499c1d20b19b298d497f6a8e41b9c13b1badef76222fe20c5d12e6538424c5',
      );
      const ivpk = derivePublicKeyFromSecretKey(ivskM);

      // console.log('ovskM:', ovskM);
      // console.log('ivskM:', ivskM);
      // console.log('payload:', payload);
      // console.log('ephSk:', ephSk);
      // console.log('recipientAddress:', recipientAddress);

      // console.log('ovKeys.pkM:', ovKeys.pkM);
      // console.log('ovKeys.skapp:', ovKeys.skApp);
      // console.log('ivpk:', ivpk);

      // console.log(payload.encrypt(ephSk, recipientAddress, ivpk, ovKeys).length);

      const taggedLog = new TaggedLog(payload, new Fr(0), new Fr(0));

      const encrypted = taggedLog.encrypt(ephSk, recipientAddress, ivpk, ovKeys).toString('hex');

      expect(encrypted).toMatchInlineSnapshot(
        `"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa711a034d916bf54af198535dc02fb2069c6931883ca70958842cdfe0386c36549d413e82a27bfa5b7080712764a455b924510b865903019befeb5df18b7af769fb0873effa97caa035c517a6b417d5f616ec6c84a93d95d17e3543b0f4b6c7a31e6e4f6cfad073c104aecc966ed30b3dfbfdff84ea73dcb1972df3a3cb4ff74aa88adb228027de514dc521cbf938589012df3e58c73a5969a601678dfedd5b6fcc008842b1538f37490b64b101edede3ccd93d635293e3510937548a9dc7dd0d26f46f92b7f56d2e914481b71800177f17d6a457b0817af3540cf855bec620789d14059446960167e7d882989ebbb47a11e881e4e243b78401a2f59ad34d88a193abfefbc5ffc31963fda9f9da3a3bbc95416b3c2d1c4e51cecca1e03074bf4e2962a615ee2e40a26f5205569bde1e7133d4bf6905e6384eb955d03738384faee8ac2e9909c8c012a2c0cd65e89823869957c51b201494f9c1a41a31298748a8012f7b5508959d8830bd2a3df0f680828702951a773568a612937d140a856ba1b6f4ccfd29ffbeead7926a9b772b233185eef697385f80ae78ac56947bb7209e8"`,
      );

      const byteArrayString = `[${encrypted.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))}]`;

      // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
      updateInlineTestData(
        'noir-projects/aztec-nr/aztec/src/encrypted_logs/payload.nr',
        'expected_encrypted_note_log',
        byteArrayString,
      );
    });
  });

  const getKeyValidationRequest = (ovskM: GrumpkinScalar, app: AztecAddress) => {
    const ovskApp = computeOvskApp(ovskM, app);
    const ovpkM = derivePublicKeyFromSecretKey(ovskM);

    return new KeyValidationRequest(ovpkM, ovskApp);
  };
});

describe('L1 Event Payload', () => {
  it('convert to and from buffer', () => {
    const payload = L1EventPayload.random();
    const taggedLog = new TaggedLog(payload);
    const buf = taggedLog.toBuffer();
    expect(TaggedLog.fromBuffer(buf, L1EventPayload).payload).toEqual(taggedLog.payload);
  });

  describe('encrypt and decrypt a full log', () => {
    let ovskM: GrumpkinScalar;
    let ivskM: GrumpkinScalar;

    let taggedLog: TaggedLog<L1EventPayload>;
    let encrypted: Buffer;
    let maskedContractAddress: AztecAddress;
    let contractAddress: AztecAddress;
    let randomness: Fr;
    let encryptedL2Log: EncryptedL2Log;

    beforeAll(() => {
      contractAddress = AztecAddress.random();
      randomness = Fr.random();
      maskedContractAddress = pedersenHash([contractAddress, randomness], 0);

      const payload = new L1EventPayload(Event.random(), contractAddress, randomness, EventSelector.random());

      ovskM = GrumpkinScalar.random();
      ivskM = GrumpkinScalar.random();

      const ovKeys = getKeyValidationRequest(ovskM, payload.contractAddress);

      const ephSk = GrumpkinScalar.random();

      const recipientAddress = AztecAddress.random();
      const ivpk = derivePublicKeyFromSecretKey(ivskM);

      taggedLog = new TaggedLog(payload);

      encrypted = taggedLog.encrypt(ephSk, recipientAddress, ivpk, ovKeys);
      encryptedL2Log = new EncryptedL2Log(encrypted, maskedContractAddress);
    });

    it('decrypt a log as incoming', () => {
      const recreated = TaggedLog.decryptAsIncoming(encryptedL2Log, ivskM, L1EventPayload);

      expect(recreated?.toBuffer()).toEqual(taggedLog.toBuffer());
    });

    it('decrypt a log as outgoing', () => {
      const recreated = TaggedLog.decryptAsOutgoing(encryptedL2Log, ovskM, L1EventPayload);

      expect(recreated?.toBuffer()).toEqual(taggedLog.toBuffer());
    });
  });

  const getKeyValidationRequest = (ovskM: GrumpkinScalar, app: AztecAddress) => {
    const ovskApp = computeOvskApp(ovskM, app);
    const ovpkM = derivePublicKeyFromSecretKey(ovskM);

    return new KeyValidationRequest(ovpkM, ovskApp);
  };
});
