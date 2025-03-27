import { PUBLIC_LOG_DATA_SIZE_IN_FIELDS } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fq, Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type SimulationProvider, WASMSimulator } from '@aztec/simulator/client';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { computeAddress, computeTaggingSecretPoint, deriveKeys } from '@aztec/stdlib/keys';
import { IndexedTaggingSecret, PrivateLog, PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { PXEOracleInterface } from './pxe_oracle_interface.js';
import { WINDOW_HALF_SIZE } from './tagging_utils.js';

jest.setTimeout(30_000);

const LOG_CAPSULE_ARRAY_BASE_SLOT = 8240937n;

async function computeSiloedTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const secretPoint = await computeTaggingSecretPoint(sender.completeAddress, sender.ivsk, recipient);
  const appSecret = await poseidon2Hash([secretPoint.x, secretPoint.y, contractAddress]);
  const tag = await poseidon2Hash([appSecret, recipient, index]);
  return poseidon2Hash([contractAddress, tag]);
}

describe('PXEOracleInterface', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let contractDataProvider: ContractDataProvider;
  let noteDataProvider: NoteDataProvider;
  let syncDataProvider: SyncDataProvider;
  let taggingDataProvider: TaggingDataProvider;
  let capsuleDataProvider: CapsuleDataProvider;
  let keyStore: KeyStore;
  let simulationProvider: SimulationProvider;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let pxeOracleInterface: PXEOracleInterface;

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    syncDataProvider = new SyncDataProvider(store);
    taggingDataProvider = new TaggingDataProvider(store);
    capsuleDataProvider = new CapsuleDataProvider(store);
    keyStore = new KeyStore(store);
    simulationProvider = new WASMSimulator();
    pxeOracleInterface = new PXEOracleInterface(
      aztecNode,
      keyStore,
      simulationProvider,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
    ); // Set up contract address
    contractAddress = await AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);
  });

  describe('sync tagged logs', () => {
    const NUM_SENDERS = 10;
    let senders: { completeAddress: CompleteAddress; ivsk: Fq; secretKey: Fr }[];

    async function generateMockLogs(tagIndex: number) {
      const logs: { [k: string]: TxScopedL2Log[] } = {};

      // Add a random note from every address in the address book for our account with index tagIndex
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const tag = await computeSiloedTagForIndex(sender, recipient.address, contractAddress, tagIndex);
        const blockNumber = 1;
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, PrivateLog.random(tag));
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS

      // Add a random note from the first sender in the address book, repeating the tag
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      const firstSender = senders[0];
      const tag = await computeSiloedTagForIndex(firstSender, recipient.address, contractAddress, tagIndex);
      const log = new TxScopedL2Log(TxHash.random(), 1, 0, PrivateLog.random(tag));
      logs[tag.toString()].push(log);
      // Accumulated logs intended for recipient: NUM_SENDERS + 1

      // Add a random note from half the address book for our account with index tagIndex + 1
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
        const sender = senders[i];
        const tag = await computeSiloedTagForIndex(sender, recipient.address, contractAddress, tagIndex + 1);
        const blockNumber = 2;
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, PrivateLog.random(tag));
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Add a random note from every address in the address book for a random recipient with index tagIndex
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const keys = await deriveKeys(Fr.random());
        const partialAddress = Fr.random();
        const randomRecipient = await computeAddress(keys.publicKeys, partialAddress);
        const tag = await computeSiloedTagForIndex(sender, randomRecipient, contractAddress, tagIndex);
        const blockNumber = 3;
        const log = new TxScopedL2Log(TxHash.random(), 0, blockNumber, PrivateLog.random(tag));
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Set up the getTaggedLogs mock
      aztecNode.getLogsByTags.mockImplementation(tags => {
        return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
      });
    }

    beforeEach(async () => {
      // Set up the address book
      senders = await timesParallel(NUM_SENDERS, async index => {
        const keys = await deriveKeys(new Fr(index));
        const partialAddress = Fr.random();
        const address = await computeAddress(keys.publicKeys, partialAddress);
        const completeAddress = await CompleteAddress.create(address, keys.publicKeys, partialAddress);
        return { completeAddress, ivsk: keys.masterIncomingViewingSecretKey, secretKey: new Fr(index) };
      });
      for (const sender of senders) {
        await taggingDataProvider.addSenderAddress(sender.completeAddress.address);
      }
      aztecNode.getLogsByTags.mockReset();
    });

    it('should sync tagged logs', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders should also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // We should have called the node 2 times:
      // 2 times: first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it('should sync tagged logs as senders', async () => {
      for (const sender of senders) {
        await addressDataProvider.addCompleteAddress(sender.completeAddress);
        await keyStore.addAccount(sender.secretKey, sender.completeAddress.partialAddress);
      }

      let tagIndex = 0;
      await generateMockLogs(tagIndex);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      const indexesAsSender = await taggingDataProvider.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSender).toStrictEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(0);

      for (let i = 0; i < senders.length; i++) {
        await pxeOracleInterface.syncTaggedLogsAsSender(
          contractAddress,
          senders[i].completeAddress.address,
          recipient.address,
        );
      }

      let indexesAsSenderAfterSync = await taggingDataProvider.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSenderAfterSync).toStrictEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // Only 1 window is obtained for each sender
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(NUM_SENDERS);
      aztecNode.getLogsByTags.mockReset();

      // We add more logs to the second half of the window to test that a second iteration in `syncTaggedLogsAsSender`
      // is handled correctly.
      tagIndex = 11;
      await generateMockLogs(tagIndex);
      for (let i = 0; i < senders.length; i++) {
        await pxeOracleInterface.syncTaggedLogsAsSender(
          contractAddress,
          senders[i].completeAddress.address,
          recipient.address,
        );
      }

      indexesAsSenderAfterSync = await taggingDataProvider.getTaggingSecretsIndexesAsSender(secrets);
      expect(indexesAsSenderAfterSync).toStrictEqual([12, 12, 12, 12, 12, 13, 13, 13, 13, 13]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(NUM_SENDERS * 2);
    });

    it('should sync tagged logs with a sender index offset', async () => {
      const tagIndex = 5;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      // First sender should have 2 logs, but keep index 6 since they were built using the same tag
      // Next 4 senders should also have index 6 = offset + 1
      // Last 5 senders should have index 7 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([6, 6, 6, 6, 6, 7, 7, 7, 7, 7]);

      // We should have called the node 2 times:
      // 2 times: first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it("should sync tagged logs for which indexes are not updated if they're inside the window", async () => {
      const tagIndex = 1;
      await generateMockLogs(tagIndex);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      // Increase our indexes to 2
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, 2)),
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // First sender should have 2 logs, but keep index 2 since they were built using the same tag
      // Next 4 senders should also have index 2 = tagIndex + 1
      // Last 5 senders should have index 3 = tagIndex + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);

      // We should have called the node 2 times:
      // first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it("should not sync tagged logs for which indexes are not updated if they're outside the window", async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      // We set the indexes to WINDOW_HALF_SIZE + 1 so that it's outside the window and for this reason no updates
      // should be triggered.
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, WINDOW_HALF_SIZE + 1)),
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS / 2);

      // Indexes should remain where we set them (window_size + 1)
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([11, 11, 11, 11, 11, 11, 11, 11, 11, 11]);

      // We should have called the node once and that is only for the first window
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1);
    });

    it('should sync tagged logs from scratch after a DB wipe', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(async sender => {
          const firstSenderSecretPoint = await computeTaggingSecretPoint(
            recipient,
            ivsk,
            sender.completeAddress.address,
          );
          return poseidon2Hash([firstSenderSecretPoint.x, firstSenderSecretPoint.y, contractAddress]);
        }),
      );

      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, WINDOW_HALF_SIZE + 2)),
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents
      let capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(0);

      // Since no logs were synced, window edge hash not been pushed and for this reason we should have called
      // the node only once for the initial window
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1);

      aztecNode.getLogsByTags.mockClear();

      // Wipe the database
      await taggingDataProvider.resetNoteSyncData();

      await pxeOracleInterface.syncTaggedLogs(contractAddress, 3);

      // Check capsule contents after DB wipe
      capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders should also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // We should have called the node 2 times:
      // first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it('should not sync tagged logs with a blockNumber > maxBlockNumber', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, 1);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(NUM_SENDERS + 1);
    });

    it('should not sync public tagged logs', async () => {
      const logs: { [k: string]: TxScopedL2Log[] } = {};
      const tag = await computeSiloedTagForIndex(senders[0], recipient.address, contractAddress, 0);

      // Create a public log with the correct tag
      const logContent = [Fr.ONE, tag, ...Array(PUBLIC_LOG_DATA_SIZE_IN_FIELDS - 2).fill(Fr.random())] as Tuple<
        Fr,
        typeof PUBLIC_LOG_DATA_SIZE_IN_FIELDS
      >;
      const log = new PublicLog(await AztecAddress.random(), logContent);
      const scopedLog = new TxScopedL2Log(TxHash.random(), 1, 0, log);

      logs[tag.toString()] = [scopedLog];
      aztecNode.getLogsByTags.mockImplementation(tags => {
        return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
      });
      await pxeOracleInterface.syncTaggedLogs(contractAddress, 1);

      // Check capsule contents
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, new Fr(LOG_CAPSULE_ARRAY_BASE_SLOT + 1n));
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(0);
    });
  });
});
