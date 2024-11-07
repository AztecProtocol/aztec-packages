import { type AztecNode, EncryptedL2NoteLog } from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  type Fq,
  Fr,
  TaggingSecret,
  computeAddress,
  computeTaggingSecret,
  deriveKeys,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/utils';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import { type PxeDatabase } from '../database/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { ContractDataOracle } from '../index.js';
import { SimulatorOracle } from './index.js';

function computeTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const sharedSecret = computeTaggingSecret(sender.completeAddress, sender.ivsk, recipient);
  const siloedSecret = poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
  return poseidon2Hash([siloedSecret, recipient, index]);
}

describe('Simulator oracle', () => {
  let aztecNode: MockProxy<AztecNode>;
  let database: PxeDatabase;
  let contractDataOracle: ContractDataOracle;
  let simulatorOracle: SimulatorOracle;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  const NUM_SENDERS = 10;
  let senders: { completeAddress: CompleteAddress; ivsk: Fq }[];

  beforeEach(async () => {
    const db = openTmpStore();
    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(db);
    contractDataOracle = new ContractDataOracle(database);
    keyStore = new KeyStore(db);
    simulatorOracle = new SimulatorOracle(contractDataOracle, database, keyStore, aztecNode);
    // Set up contract address
    contractAddress = AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await database.addCompleteAddress(recipient);
    // Set up the address book
    senders = times(NUM_SENDERS).map((_, index) => {
      const keys = deriveKeys(new Fr(index));
      const partialAddress = Fr.random();
      const address = computeAddress(keys.publicKeys, partialAddress);
      const completeAddress = new CompleteAddress(address, keys.publicKeys, partialAddress);
      return { completeAddress, ivsk: keys.masterIncomingViewingSecretKey };
    });
    for (const sender of senders) {
      await database.addContactAddress(sender.completeAddress.address);
    }

    const logs: { [k: string]: EncryptedL2NoteLog[] } = {};

    // Add a random note from every address in the address book for our account with index 0
    // Compute the tag as sender (knowledge of preaddress and ivsk)
    for (const sender of senders) {
      const tag = computeTagForIndex(sender, recipient.address, contractAddress, 0);
      const log = EncryptedL2NoteLog.random(tag);
      logs[tag.toString()] = [log];
    }
    // Accumulated logs intended for recipient: NUM_SENDERS

    // Add a random note from the first sender in the address book, repeating the tag
    // Compute the tag as sender (knowledge of preaddress and ivsk)
    const firstSender = senders[0];
    const tag = computeTagForIndex(firstSender, recipient.address, contractAddress, 0);
    const log = EncryptedL2NoteLog.random(tag);
    logs[tag.toString()].push(log);
    // Accumulated logs intended for recipient: NUM_SENDERS + 1

    // Add a random note from half the address book for our account with index 1
    // Compute the tag as sender (knowledge of preaddress and ivsk)
    for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
      const sender = senders[i];
      const tag = computeTagForIndex(sender, recipient.address, contractAddress, 1);
      const log = EncryptedL2NoteLog.random(tag);
      logs[tag.toString()] = [log];
    }
    // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

    // Add a random note from every address in the address book for a random recipient with index 0
    // Compute the tag as sender (knowledge of preaddress and ivsk)
    for (const sender of senders) {
      const keys = deriveKeys(Fr.random());
      const partialAddress = Fr.random();
      const randomRecipient = computeAddress(keys.publicKeys, partialAddress);
      const tag = computeTagForIndex(sender, randomRecipient, contractAddress, 0);
      const log = EncryptedL2NoteLog.random(tag);
      logs[tag.toString()] = [log];
    }
    // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

    // Set up the getTaggedLogs mock

    aztecNode.getLogsByTags.mockImplementation(tags => {
      return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
    });
  });

  describe('sync tagged logs', () => {
    it('should sync tagged logs', async () => {
      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, recipient.address);
      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first one + half of the logs for the second index
      expect(syncedLogs).toHaveLength(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated

      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const directionalSecrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        const siloedSecret = poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
        return new TaggingSecret(siloedSecret, recipient.address);
      });

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders hould also have index 1
      // Last 5 senders should have index 2
      const indexes = await database.getTaggingSecretsIndexes(directionalSecrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    });

    it('should only sync tagged logs for which indexes are not updated', async () => {
      // Recompute the secrets (as recipient) to update indexes

      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const directionalSecrets = senders.map(sender => {
        const firstSenderSharedSecret = computeTaggingSecret(recipient, ivsk, sender.completeAddress.address);
        const siloedSecret = poseidon2Hash([firstSenderSharedSecret.x, firstSenderSharedSecret.y, contractAddress]);
        return new TaggingSecret(siloedSecret, recipient.address);
      });

      await database.incrementTaggingSecretsIndexes(directionalSecrets);

      const syncedLogs = await simulatorOracle.syncTaggedLogs(contractAddress, recipient.address);

      // Only half of the logs should be synced since we start from index 1, the other half should be skipped
      expect(syncedLogs).toHaveLength(NUM_SENDERS / 2);

      // We should have called the node twice, once for index 1 and once for index 2 (which should return no logs)
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });
  });
});
