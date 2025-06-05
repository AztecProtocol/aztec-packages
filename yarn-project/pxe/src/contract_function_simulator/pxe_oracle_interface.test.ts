import { PUBLIC_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { padArrayEnd, timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fq, Fr } from '@aztec/foundation/fields';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { randomInBlock } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { computeAddress, computeAppTaggingSecret, deriveKeys } from '@aztec/stdlib/keys';
import { IndexedTaggingSecret, PrivateLog, PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxEffect, TxHash, randomIndexedTxEffect } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';
import { NoteDao } from '../storage/note_data_provider/note_dao.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { PrivateEventDataProvider } from '../storage/private_event_data_provider/private_event_data_provider.js';
import { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { PXEOracleInterface } from './pxe_oracle_interface.js';
import { WINDOW_HALF_SIZE } from './tagging_utils.js';

jest.setTimeout(30_000);

async function computeSiloedTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const appSecret = await computeAppTaggingSecret(sender.completeAddress, sender.ivsk, recipient, contractAddress);
  const indexedTaggingSecret = new IndexedTaggingSecret(appSecret, index);
  return indexedTaggingSecret.computeSiloedTag(recipient, contractAddress);
}

describe('PXEOracleInterface', () => {
  let aztecNode: MockProxy<AztecNode>;

  let addressDataProvider: AddressDataProvider;
  let privateEventDataProvider: PrivateEventDataProvider;
  let contractDataProvider: ContractDataProvider;
  let noteDataProvider: NoteDataProvider;
  let syncDataProvider: SyncDataProvider;
  let taggingDataProvider: TaggingDataProvider;
  let capsuleDataProvider: CapsuleDataProvider;
  let keyStore: KeyStore;

  let recipient: CompleteAddress;
  let contractAddress: AztecAddress;

  let pxeOracleInterface: PXEOracleInterface;

  // The block number of the first log to be emitted.
  const MIN_BLOCK_NUMBER_OF_A_LOG = 1;
  // The block number of the last log to be emitted.
  const MAX_BLOCK_NUMBER_OF_A_LOG = 3;

  beforeEach(async () => {
    const store = await openTmpStore('test');
    aztecNode = mock<AztecNode>();
    contractDataProvider = new ContractDataProvider(store);
    jest.spyOn(contractDataProvider, 'getDebugContractName').mockImplementation(() => Promise.resolve('TestContract'));

    addressDataProvider = new AddressDataProvider(store);
    privateEventDataProvider = new PrivateEventDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    syncDataProvider = new SyncDataProvider(store);
    taggingDataProvider = new TaggingDataProvider(store);
    capsuleDataProvider = new CapsuleDataProvider(store);
    keyStore = new KeyStore(store);
    pxeOracleInterface = new PXEOracleInterface(
      aztecNode,
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
    ); // Set up contract address
    contractAddress = await AztecAddress.random();
    // Set up recipient account
    recipient = await keyStore.addAccount(new Fr(69), Fr.random());
    await addressDataProvider.addCompleteAddress(recipient);

    // PXEOracleInterface.syncTaggedLogs(...) function syncs logs up to the block number up to which PXE synced. We set
    // the synced block number to that of the last emitted log to receive all the logs by default.
    await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);
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
        const log = new TxScopedL2Log(TxHash.random(), 0, 0, MIN_BLOCK_NUMBER_OF_A_LOG, PrivateLog.random(tag));
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS

      // Add a random note from the first sender in the address book, repeating the tag
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      const firstSender = senders[0];
      const tag = await computeSiloedTagForIndex(firstSender, recipient.address, contractAddress, tagIndex);
      const log = new TxScopedL2Log(TxHash.random(), 1, 0, 0, PrivateLog.random(tag));
      logs[tag.toString()].push(log);
      // Accumulated logs intended for recipient: NUM_SENDERS + 1

      // Add a random note from half the address book for our account with index tagIndex + 1
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
        const sender = senders[i];
        const tag = await computeSiloedTagForIndex(sender, recipient.address, contractAddress, tagIndex + 1);
        const blockNumber = 2;
        const log = new TxScopedL2Log(TxHash.random(), 0, 0, blockNumber, PrivateLog.random(tag));
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
        const log = new TxScopedL2Log(TxHash.random(), 0, 0, MAX_BLOCK_NUMBER_OF_A_LOG, PrivateLog.random(tag));
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS + 1 + NUM_SENDERS / 2

      // Set up the getPrivateLogsByTags mock
      aztecNode.getLogsByTags.mockImplementation(tags => {
        return Promise.resolve(tags.map(tag => logs[tag.toString()] ?? []));
      });
    }

    // Set to a random value in this test we don't care about Noir loading the logs from the capsule array.
    const PENDING_TAGGED_LOG_ARRAY_BASE_SLOT = Fr.random();

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
      aztecNode.getTxEffect.mockResolvedValue({
        ...randomInBlock(await TxEffect.random()),
        txIndexInBlock: 0,
      });
    });

    it('should sync tagged logs', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // We expect to have all logs intended for the recipient synced (and hence stored in the capsule for later
      // processing), one per sender + 1 with a duplicated tag for the first sender + half of the logs for the second
      // index
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders should also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets, recipient.address);

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
      // An array of direction-less secrets for each sender-recipient pair
      const secrets = await Promise.all(
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      // We only get the tagging secret at index `index` for each sender because each sender only needs to track
      // their own tagging secret with the recipient. The secrets array contains all sender-recipient pairs, so
      // secrets[index] corresponds to the tagging secret between sender[index] and the recipient.
      const getTaggingSecretsIndexesAsSenderForSenders = () =>
        Promise.all(
          senders.map((sender, index) =>
            taggingDataProvider.getTaggingSecretsIndexesAsSender([secrets[index]], sender.completeAddress.address),
          ),
        );

      const indexesAsSender = await getTaggingSecretsIndexesAsSenderForSenders();
      expect(indexesAsSender).toStrictEqual([[0], [0], [0], [0], [0], [0], [0], [0], [0], [0]]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(0);

      for (let i = 0; i < senders.length; i++) {
        await pxeOracleInterface.syncTaggedLogsAsSender(
          contractAddress,
          senders[i].completeAddress.address,
          recipient.address,
        );
      }

      let indexesAsSenderAfterSync = await getTaggingSecretsIndexesAsSenderForSenders();
      expect(indexesAsSenderAfterSync).toStrictEqual([[1], [1], [1], [1], [1], [2], [2], [2], [2], [2]]);

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

      indexesAsSenderAfterSync = await getTaggingSecretsIndexesAsSenderForSenders();
      expect(indexesAsSenderAfterSync).toStrictEqual([[12], [12], [12], [12], [12], [13], [13], [13], [13], [13]]);

      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(NUM_SENDERS * 2);
    });

    it('should sync tagged logs with a sender index offset', async () => {
      const tagIndex = 5;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first
      // one + half of the logs for the second index
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      // First sender should have 2 logs, but keep index 6 since they were built using the same tag
      // Next 4 senders should also have index 6 = offset + 1
      // Last 5 senders should have index 7 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets, recipient.address);

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
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      // Increase our indexes to 2
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, 2)),
        recipient.address,
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // Even if our index as recipient is higher than what the sender sent, we should be able to find the logs
      // since the window starts at Math.max(0, 2 - window_size) = 0
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // First sender should have 2 logs, but keep index 2 since they were built using the same tag
      // Next 4 senders should also have index 2 = tagIndex + 1
      // Last 5 senders should have index 3 = tagIndex + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets, recipient.address);

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
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      // We set the indexes to WINDOW_HALF_SIZE + 1 so that it's outside the window and for this reason no updates
      // should be triggered.
      const index = WINDOW_HALF_SIZE + 1;
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, index)),
        recipient.address,
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // Only half of the logs should be synced since we start from index 1 = (11 - window_size), the other half should
      // be skipped
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS / 2);

      // Indexes should remain where we set them (window_size + 1)
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets, recipient.address);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([index, index, index, index, index, index, index, index, index, index]);

      // We should have called the node once and that is only for the first window
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1);
    });

    it('should sync tagged logs from scratch after a DB wipe', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);

      // Recompute the secrets (as recipient) to update indexes
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(sender =>
          computeAppTaggingSecret(recipient, ivsk, sender.completeAddress.address, contractAddress),
        ),
      );

      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        secrets.map(secret => new IndexedTaggingSecret(secret, WINDOW_HALF_SIZE + 2)),
        recipient.address,
      );

      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // No logs should be synced (and hence no capsules stored) since we start from index 2 = 12 - window_size
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, 0);

      // Since no logs were synced, window edge hash not been pushed and for this reason we should have called
      // the node only once for the initial window
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1);

      aztecNode.getLogsByTags.mockClear();

      // Wipe the database
      await taggingDataProvider.resetNoteSyncData();

      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders should also have index 1 = offset + 1
      // Last 5 senders should have index 2 = offset + 2
      const indexes = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient(secrets, recipient.address);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

      // We should have called the node 2 times:
      // first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it('should not sync tagged logs with a blockNumber larger than the block number to which PXE is synced', async () => {
      // We set the block number to which PXE is synced to a block number in which only the first batch of logs was
      // emitted and then we check that we receive logs only from this batch.
      await setSyncedBlockNumber(MIN_BLOCK_NUMBER_OF_A_LOG);

      const tagIndex = 0;
      await generateMockLogs(tagIndex);
      await pxeOracleInterface.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // Only NUM_SENDERS + 1 logs should be synched, since the rest have blockNumber > 1
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1);
    });

    const expectPendingTaggedLogArrayLengthToBe = async (contractAddress: AztecAddress, expectedLength: number) => {
      // Capsule array length is stored in the array base slot.
      const capsule = await capsuleDataProvider.loadCapsule(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);
      if (expectedLength === 0 && capsule === null) {
        // If expected length is 0 we are fine with the capsule not existing since the array might not have been
        // initialized yet.
        return;
      }
      expect(capsule).toBeDefined();
      expect(capsule!.length).toBe(1);
      expect(capsule![0].toNumber()).toBe(expectedLength);
    };
  });

  describe('deliverNote', () => {
    let noteHash: Fr;
    let nullifier: Fr;
    let txHash: TxHash;
    let storageSlot: Fr;
    let noteNonce: Fr;
    let content: Fr[];

    beforeEach(() => {
      noteHash = Fr.random();
      nullifier = Fr.random();
      txHash = TxHash.random();
      storageSlot = Fr.random();
      noteNonce = Fr.random();
      content = [Fr.random(), Fr.random()];
    });

    it('should store note if it exists in note hash tree and is not nullified', async () => {
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      // Mock note exists in tree
      aztecNode.findLeavesIndexes.mockImplementation((_blockNum, treeId, leaves) => {
        if (treeId === MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          return Promise.resolve([randomInBlock(0n)]);
        }
        return Promise.resolve([undefined]);
      });

      await pxeOracleInterface.deliverNote(
        contractAddress,
        storageSlot,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
      );

      // Verify note was stored
      const notes = await noteDataProvider.getNotes({ recipient: recipient.address });
      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });

    it('should throw if note does not exist in note hash tree', async () => {
      // Mock note does not exist in tree
      aztecNode.findLeavesIndexes.mockImplementation(() => Promise.resolve([undefined]));

      await expect(
        pxeOracleInterface.deliverNote(
          contractAddress,
          storageSlot,
          noteNonce,
          content,
          noteHash,
          nullifier,
          txHash,
          recipient.address,
        ),
      ).rejects.toThrow(/not present on the tree/);
    });

    it('should store and immediately remove note if it is already nullified', async () => {
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      const siloedNullifier = await siloNullifier(contractAddress, nullifier);

      // Mock note exists and is nullified
      aztecNode.findLeavesIndexes.mockImplementation((_blockNum, treeId, leaves) => {
        if (treeId === MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          return Promise.resolve([randomInBlock(0n)]);
        }
        if (treeId === MerkleTreeId.NULLIFIER_TREE && leaves[0].equals(siloedNullifier)) {
          return Promise.resolve([randomInBlock(0n)]);
        }
        return Promise.resolve([undefined]);
      });

      await pxeOracleInterface.deliverNote(
        contractAddress,
        storageSlot,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
      );

      // Verify note was removed
      const notes = await noteDataProvider.getNotes({ recipient: recipient.address });
      expect(notes).toHaveLength(0);
    });

    // Verifies that notes are only accepted from blocks that have been synced by PXE. We mock
    // `AztecNode.findLeavesIndexes` to only return the note hash in blocks beyond our current
    // sync point, and then we check that the function correctly throws.
    it('should reject notes that exist only in unsynced future blocks', async () => {
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      const syncedBlockNumber = 100;
      await setSyncedBlockNumber(syncedBlockNumber);

      // Mock note only exists in blocks after synced block
      aztecNode.findLeavesIndexes.mockImplementation((blockNum, treeId, leaves) => {
        if (treeId === MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
            return Promise.resolve([randomInBlock(0n)]);
          }
        }
        return Promise.resolve([undefined]);
      });

      await expect(
        pxeOracleInterface.deliverNote(
          contractAddress,
          storageSlot,
          noteNonce,
          content,
          noteHash,
          nullifier,
          txHash,
          recipient.address,
        ),
      ).rejects.toThrow(/not present on the tree/);
    });

    // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
    // synced yet. We mock the note to exist in a synced block but its nullifier to only exist in future blocks, then
    // verify the note can still be obtained as active.
    it('should not remove note if nullifier only exists in unsynced blocks', async () => {
      const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
      const siloedNullifier = await siloNullifier(contractAddress, nullifier);
      const syncedBlockNumber = 100;
      await setSyncedBlockNumber(syncedBlockNumber);

      // Mock note exists in synced blocks but nullifier only exists after
      aztecNode.findLeavesIndexes.mockImplementation((blockNum, treeId, leaves) => {
        if (treeId === MerkleTreeId.NOTE_HASH_TREE && leaves[0].equals(uniqueNoteHash)) {
          return Promise.resolve([randomInBlock(0n)]);
        }
        if (treeId === MerkleTreeId.NULLIFIER_TREE && leaves[0].equals(siloedNullifier)) {
          if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
            return Promise.resolve([randomInBlock(0n)]);
          }
        }
        return Promise.resolve([undefined]);
      });

      await pxeOracleInterface.deliverNote(
        contractAddress,
        storageSlot,
        noteNonce,
        content,
        noteHash,
        nullifier,
        txHash,
        recipient.address,
      );

      // Verify note was stored and not removed
      const notes = await noteDataProvider.getNotes({ recipient: recipient.address, status: NoteStatus.ACTIVE });
      expect(notes).toHaveLength(1);
      expect(notes[0].noteHash.equals(noteHash)).toBe(true);
    });
  });

  describe('getPublicLogByTag', () => {
    const tag = Fr.random();

    beforeEach(() => {
      aztecNode.getLogsByTags.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns null if no logs found for tag', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);

      const result = await pxeOracleInterface.getPublicLogByTag(tag, contractAddress);
      expect(result).toBeNull();
    });

    it('returns log data when single log found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const result = (await pxeOracleInterface.getPublicLogByTag(tag, logContractAddress))!;

      expect(result.logPayload).toEqual(scopedLog.log.getEmittedFieldsWithoutTag());
      expect(result.uniqueNoteHashesInTx).toEqual(indexedTxEffect.data.noteHashes);
      expect(result.txHash).toEqual(scopedLog.txHash);
      expect(result.firstNullifierInTx).toEqual(indexedTxEffect.data.nullifiers[0]);

      expect(aztecNode.getLogsByTags).toHaveBeenCalledWith([tag]);
      expect(aztecNode.getTxEffect).toHaveBeenCalledWith(scopedLog.txHash);
    });

    it('throws if multiple logs found for tag', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog, scopedLog]]);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(pxeOracleInterface.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(pxeOracleInterface.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(
        /failed to retrieve tx effects/,
      );
    });

    it('returns log fields that are actually emitted', async () => {
      const logContractAddress = await AztecAddress.random();
      const logPlaintext = [Fr.random()];
      const logContent = [tag, ...logPlaintext];

      const log = PublicLog.from({
        contractAddress: logContractAddress,
        fields: padArrayEnd(logContent, Fr.ZERO, PUBLIC_LOG_SIZE_IN_FIELDS),
        emittedLength: logContent.length,
      });
      const scopedLogWithPadding = new TxScopedL2Log(
        TxHash.random(),
        randomInt(100),
        randomInt(100),
        randomInt(100),
        log,
      );

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLogWithPadding]]);
      aztecNode.getTxEffect.mockResolvedValue(await randomIndexedTxEffect());

      const result = await pxeOracleInterface.getPublicLogByTag(tag, logContractAddress);

      expect(result?.logPayload).toEqual(logPlaintext);
    });
  });

  describe('getPrivateLogByTag', () => {
    let tag: Fr;

    beforeEach(() => {
      tag = Fr.random();
    });

    it('returns null if no logs found', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);
      const result = await pxeOracleInterface.getPrivateLogByTag(tag);
      expect(result).toBeNull();
    });

    it('returns log and tx effect if single log found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

      const result = await pxeOracleInterface.getPrivateLogByTag(tag);

      expect(result?.logPayload).toEqual(scopedLog.log.getEmittedFieldsWithoutTag());
      expect(result?.uniqueNoteHashesInTx).toEqual(indexedTxEffect.data.noteHashes);
      expect(result?.txHash).toEqual(scopedLog.txHash);
      expect(result?.firstNullifierInTx).toEqual(indexedTxEffect.data.nullifiers[0]);
      expect(aztecNode.getTxEffect).toHaveBeenCalledWith(scopedLog.txHash);
    });

    it('throws if multiple logs found for tag', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog, scopedLog]]);

      await expect(pxeOracleInterface.getPrivateLogByTag(tag)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);

      await expect(pxeOracleInterface.getPrivateLogByTag(tag)).rejects.toThrow(/failed to retrieve tx effects/);
    });
  });

  describe('removeNullifiedNotes', () => {
    let recipient: AztecAddress;

    beforeEach(async () => {
      // Check that there are no notes in the database
      const notes = await noteDataProvider.getNotes({});
      expect(notes).toHaveLength(0);

      // Check that the expected number of accounts is present
      const accounts = await keyStore.getAccounts();
      expect(accounts).toHaveLength(1);

      recipient = accounts[0];
    });

    it('should remove notes that have been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress, recipient });

      // Spy on the noteDataProvider.removeNullifiedNotes to later on have additional guarantee that we really removed
      // the note.
      jest.spyOn(noteDataProvider, 'removeNullifiedNotes');

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Set up the nullifier in the merkle tree
      const nullifierIndex = randomInBlock(123n);
      aztecNode.findLeavesIndexes.mockResolvedValue([nullifierIndex]);

      // Call the function under test
      await pxeOracleInterface.removeNullifiedNotes(contractAddress);

      // Verify the note was removed by checking storage
      const remainingNotes = await noteDataProvider.getNotes({ contractAddress, recipient, status: NoteStatus.ACTIVE });
      expect(remainingNotes).toHaveLength(0);

      // Verify the note was removed by checking the spy
      expect(noteDataProvider.removeNullifiedNotes).toHaveBeenCalledTimes(1);
    });

    it('should keep notes that have not been nullified', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress, recipient });

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // No nullifier found in merkle tree
      aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);

      // Call the function under test
      await pxeOracleInterface.removeNullifiedNotes(contractAddress);

      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({ contractAddress, recipient, status: NoteStatus.ACTIVE });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    // Verifies that notes are not marked as nullified when their nullifier only exists in blocks that haven't been
    // synced yet. We mock the nullifier to only exist in blocks beyond our current sync point, then verify the note
    // is not removed by removeNullifiedNotes.
    it('should not remove notes if nullifier is in unsynced blocks', async () => {
      // Set up initial state with a note
      const noteDao = await NoteDao.random({ contractAddress, recipient });
      const syncedBlockNumber = 100;
      await setSyncedBlockNumber(syncedBlockNumber);

      // Add the note to storage
      await noteDataProvider.addNotes([noteDao], recipient);

      // Mock nullifier to only exist after synced block
      aztecNode.findLeavesIndexes.mockImplementation(blockNum => {
        if (typeof blockNum === 'number' && blockNum > syncedBlockNumber) {
          return Promise.resolve([randomInBlock(0n)]);
        }
        return Promise.resolve([undefined]);
      });

      // Call the function under test
      await pxeOracleInterface.removeNullifiedNotes(contractAddress);

      // Verify note still exists
      const remainingNotes = await noteDataProvider.getNotes({ contractAddress, recipient, status: NoteStatus.ACTIVE });
      expect(remainingNotes).toHaveLength(1);
      expect(remainingNotes[0]).toEqual(noteDao);
    });

    it('should search for notes from all accounts', async () => {
      // Add multiple accounts to keystore
      const numAccounts = 3;

      await keyStore.addAccount(Fr.random(), Fr.random());
      await keyStore.addAccount(Fr.random(), Fr.random());

      expect(await keyStore.getAccounts()).toHaveLength(numAccounts);

      // Spy on the noteDataProvider.getNotesSpy
      const getNotesSpy = jest.spyOn(noteDataProvider, 'getNotes');

      // Call the function under test
      await pxeOracleInterface.removeNullifiedNotes(contractAddress);

      // Verify removeNullifiedNotes was called once for each account
      expect(getNotesSpy).toHaveBeenCalledTimes(numAccounts);

      // Verify getNotes was called with the correct contract address and recipient for each account
      const accounts = await keyStore.getAccounts();
      accounts.forEach(recipient => {
        expect(getNotesSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress, recipient }));
      });
    });
  });

  const setSyncedBlockNumber = (blockNumber: number) => {
    return syncDataProvider.setHeader(
      BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: new Fr(blockNumber) }),
      }),
    );
  };
});
