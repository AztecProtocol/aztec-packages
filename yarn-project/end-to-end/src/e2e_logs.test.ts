import { type AccountWalletWithSecretKey, Fr, TaggedNote } from '@aztec/aztec.js';
import { deriveMasterIncomingViewingSecretKey } from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { TestLogContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('Logs', () => {
  let testLogContract: TestLogContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];

  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets } = await setup(2));

    await publicDeployAccounts(wallets[0], wallets.slice(0, 2));

    testLogContract = await TestLogContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  describe('emits an encrypted log', () => {
    it('works', async () => {
      const randomness = Fr.random();
      const eventTypeId = Fr.random();
      const preimage = makeTuple(6, Fr.random);

      const tx = await testLogContract.methods.emit_encrypted_log(randomness, eventTypeId, preimage).prove();

      const encryptedLogs = tx.encryptedLogs.unrollLogs();

      expect(encryptedLogs.length).toBe(1);

      const decryptedLog = TaggedNote.decryptAsIncoming(
        encryptedLogs[0].data,
        deriveMasterIncomingViewingSecretKey(wallets[0].getSecretKey()),
      );

      expect(decryptedLog!.notePayload.contractAddress).toStrictEqual(testLogContract.address);
      expect(decryptedLog!.notePayload.storageSlot).toStrictEqual(randomness);
      expect(decryptedLog!.notePayload.noteTypeId).toStrictEqual(eventTypeId);
      expect(decryptedLog!.notePayload.note.items).toStrictEqual(preimage);
    });
  });
});
