import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto/random';
import { type Fq, Fr } from '@aztec/foundation/curves/bn254';
import { KeyStore } from '@aztec/key-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash, randomDataInBlock } from '@aztec/stdlib/block';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { computeAddress, deriveKeys } from '@aztec/stdlib/keys';
import { DirectionalAppTaggingSecret, PrivateLog, PublicLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import { BlockHeader, GlobalVariables, TxEffect, TxHash, randomIndexedTxEffect } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { RecipientTaggingDataProvider } from '../storage/tagging_data_provider/recipient_tagging_data_provider.js';
import { WINDOW_HALF_SIZE } from '../tagging/constants.js';
import { SiloedTag } from '../tagging/siloed_tag.js';
import { Tag } from '../tagging/tag.js';
import { LogService } from './log_service.js';

async function computeSiloedTagForIndex(
  sender: { completeAddress: CompleteAddress; ivsk: Fq },
  recipient: AztecAddress,
  contractAddress: AztecAddress,
  index: number,
) {
  const secret = await DirectionalAppTaggingSecret.compute(
    sender.completeAddress,
    sender.ivsk,
    recipient,
    contractAddress,
    recipient,
  );
  const tag = await Tag.compute({ secret, index });
  return SiloedTag.compute(tag, contractAddress);
}

describe('LogService', () => {
  let contractAddress: AztecAddress;
  let recipient: CompleteAddress;
  let keyStore: KeyStore;
  let aztecNode: MockProxy<AztecNode>;
  let recipientTaggingDataProvider: RecipientTaggingDataProvider;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let capsuleDataProvider: CapsuleDataProvider;
  let addressDataProvider: AddressDataProvider;

  let logService: LogService;

  describe('sync tagged logs', () => {
    const NUM_SENDERS = 10;

    let senders: { completeAddress: CompleteAddress; ivsk: Fq; secretKey: Fr }[];

    // The block number of the first log to be emitted.
    const MIN_BLOCK_NUMBER_OF_A_LOG = BlockNumber(1);
    // The block number of the last log to be emitted.
    const MAX_BLOCK_NUMBER_OF_A_LOG = BlockNumber(3);

    const setSyncedBlockNumber = (blockNumber: BlockNumber) => {
      return anchorBlockDataProvider.setHeader(
        BlockHeader.empty({
          globalVariables: GlobalVariables.empty({ blockNumber }),
        }),
      );
    };

    async function generateMockLogs(tagIndex: number) {
      const logs: { [k: string]: TxScopedL2Log[] } = {};

      // Add a random note from every address in the address book for our account with index tagIndex
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (const sender of senders) {
        const tag = await computeSiloedTagForIndex(sender, recipient.address, contractAddress, tagIndex);
        const log = new TxScopedL2Log(
          TxHash.random(),
          0,
          0,
          MIN_BLOCK_NUMBER_OF_A_LOG,
          L2BlockHash.random(),
          0n,
          PrivateLog.random(tag.value),
        );
        logs[tag.toString()] = [log];
      }
      // Accumulated logs intended for recipient: NUM_SENDERS

      // Add a random note from the first sender in the address book, repeating the tag
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      const firstSender = senders[0];
      const tag = await computeSiloedTagForIndex(firstSender, recipient.address, contractAddress, tagIndex);
      const log = new TxScopedL2Log(
        TxHash.random(),
        1,
        0,
        BlockNumber.ZERO,
        L2BlockHash.random(),
        0n,
        PrivateLog.random(tag.value),
      );
      logs[tag.toString()].push(log);
      // Accumulated logs intended for recipient: NUM_SENDERS + 1

      // Add a random note from half the address book for our account with index tagIndex + 1
      // Compute the tag as sender (knowledge of preaddress and ivsk)
      for (let i = NUM_SENDERS / 2; i < NUM_SENDERS; i++) {
        const sender = senders[i];
        const tag = await computeSiloedTagForIndex(sender, recipient.address, contractAddress, tagIndex + 1);
        const blockNumber = BlockNumber(2);
        const log = new TxScopedL2Log(
          TxHash.random(),
          0,
          0,
          blockNumber,
          L2BlockHash.random(),
          0n,
          PrivateLog.random(tag.value),
        );
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
        const log = new TxScopedL2Log(
          TxHash.random(),
          0,
          0,
          MAX_BLOCK_NUMBER_OF_A_LOG,
          L2BlockHash.random(),
          0n,
          PrivateLog.random(tag.value),
        );
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
      // Set up contract address
      contractAddress = await AztecAddress.random();

      aztecNode = mock<AztecNode>();

      const store = await openTmpStore('test');

      keyStore = new KeyStore(store);
      recipientTaggingDataProvider = new RecipientTaggingDataProvider(store);
      anchorBlockDataProvider = new AnchorBlockDataProvider(store);
      capsuleDataProvider = new CapsuleDataProvider(store);
      addressDataProvider = new AddressDataProvider(store);
      await setSyncedBlockNumber(MAX_BLOCK_NUMBER_OF_A_LOG);

      // Set up recipient account
      recipient = await keyStore.addAccount(new Fr(69), Fr.random());
      await addressDataProvider.addCompleteAddress(recipient);
      // Set up the address book
      senders = await timesParallel(NUM_SENDERS, async index => {
        const keys = await deriveKeys(new Fr(index));
        const partialAddress = Fr.random();
        const address = await computeAddress(keys.publicKeys, partialAddress);
        const completeAddress = await CompleteAddress.create(address, keys.publicKeys, partialAddress);
        return { completeAddress, ivsk: keys.masterIncomingViewingSecretKey, secretKey: new Fr(index) };
      });
      for (const sender of senders) {
        await recipientTaggingDataProvider.addSenderAddress(sender.completeAddress.address);
      }
      aztecNode.getLogsByTags.mockReset();
      aztecNode.getTxEffect.mockResolvedValue({
        ...randomDataInBlock(await TxEffect.random({ numNullifiers: 1 })),
        txIndexInBlock: 0,
      });

      logService = new LogService(
        aztecNode,
        anchorBlockDataProvider,
        keyStore,
        capsuleDataProvider,
        recipientTaggingDataProvider,
        addressDataProvider,
      );
    });

    it('should sync tagged logs', async () => {
      const tagIndex = 0;
      await generateMockLogs(tagIndex);
      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // We expect to have all logs intended for the recipient synced (and hence stored in the capsule for later
      // processing), one per sender + 1 with a duplicated tag for the first sender + half of the logs for the second
      // index
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(sender =>
          DirectionalAppTaggingSecret.compute(
            recipient,
            ivsk,
            sender.completeAddress.address,
            contractAddress,
            recipient.address,
          ),
        ),
      );

      // First sender should have 2 logs, but keep index 0 since they were built using the same tag
      // Next 4 senders should also have index 0 = offset + 0
      // Last 5 senders should have index 1 = offset + 1
      const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);

      // We should have called the node 2 times:
      // 2 times: first time during initial request, second time after pushing the edge of the window once
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(2);
    });

    it('should sync tagged logs with a sender index offset', async () => {
      const tagIndex = 5;
      await generateMockLogs(tagIndex);
      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // We expect to have all logs intended for the recipient, one per sender + 1 with a duplicated tag for the first
      // one + half of the logs for the second index
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // Recompute the secrets (as recipient) to ensure indexes are updated
      const ivsk = await keyStore.getMasterIncomingViewingSecretKey(recipient.address);
      const secrets = await Promise.all(
        senders.map(sender =>
          DirectionalAppTaggingSecret.compute(
            recipient,
            ivsk,
            sender.completeAddress.address,
            contractAddress,
            recipient.address,
          ),
        ),
      );

      // First sender should have 2 logs, but keep index 5 since they were built using the same tag
      // Next 4 senders should also have index 5 = offset
      // Last 5 senders should have index 6 = offset + 1
      const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([5, 5, 5, 5, 5, 6, 6, 6, 6, 6]);

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
          DirectionalAppTaggingSecret.compute(
            recipient,
            ivsk,
            sender.completeAddress.address,
            contractAddress,
            recipient.address,
          ),
        ),
      );

      // Set last used indexes to 1 (so next scan starts at 2)
      await recipientTaggingDataProvider.setLastUsedIndexes(secrets.map(secret => ({ secret, index: 1 })));

      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // Even if our index as recipient is higher than what the sender sent, we should be able to find the logs
      // since the window starts at Math.max(0, 2 - window_size) = 0
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS + 1 + NUM_SENDERS / 2);

      // First sender should have 2 logs, but keep index 1 since they were built using the same tag
      // Next 4 senders should also have index 1 = tagIndex
      // Last 5 senders should have index 2 = tagIndex + 1
      const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);

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
          DirectionalAppTaggingSecret.compute(
            recipient,
            ivsk,
            sender.completeAddress.address,
            contractAddress,
            recipient.address,
          ),
        ),
      );

      // We set the last used indexes to WINDOW_HALF_SIZE so that next scan starts at WINDOW_HALF_SIZE + 1,
      // which is outside the window, and for this reason no updates should be triggered.
      const index = WINDOW_HALF_SIZE + 1;
      await recipientTaggingDataProvider.setLastUsedIndexes(secrets.map(secret => ({ secret, index })));

      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // Only half of the logs should be synced since we start from index 1 = (11 - window_size), the other half should
      // be skipped
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, NUM_SENDERS / 2);

      // Indexes should remain where we set them (window_size)
      const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);

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
          DirectionalAppTaggingSecret.compute(
            recipient,
            ivsk,
            sender.completeAddress.address,
            contractAddress,
            recipient.address,
          ),
        ),
      );

      await recipientTaggingDataProvider.setLastUsedIndexes(
        secrets.map(secret => ({ secret, index: WINDOW_HALF_SIZE + 2 })),
      );

      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // No logs should be synced (and hence no capsules stored) since we start from index 2 = 12 - window_size
      await expectPendingTaggedLogArrayLengthToBe(contractAddress, 0);

      // Since no logs were synced, window edge hash not been pushed and for this reason we should have called
      // the node only once for the initial window
      expect(aztecNode.getLogsByTags.mock.calls.length).toBe(1);

      aztecNode.getLogsByTags.mockClear();

      // Wipe the database
      await recipientTaggingDataProvider.resetNoteSyncData();

      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

      // First sender should have 2 logs, but keep index 0 since they were built using the same tag
      // Next 4 senders should also have index 0 = offset
      // Last 5 senders should have index 1 = offset + 1
      const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);

      expect(indexes).toHaveLength(NUM_SENDERS);
      expect(indexes).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);

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
      await logService.syncTaggedLogs(contractAddress, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

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

  describe('bulkRetrieveLogs', () => {
    const unsiloedTag = Fr.random();

    beforeEach(() => {
      aztecNode.getLogsByTags.mockReset();
      aztecNode.getTxEffect.mockReset();
    });

    it('returns no logs if none are found', async () => {
      aztecNode.getLogsByTags.mockResolvedValue([[]]);
      const request = new LogRetrievalRequest(contractAddress, unsiloedTag);
      const responses = await logService.bulkRetrieveLogs([request]);
      expect(responses.length).toEqual(1);
      expect(responses[0]).toBeNull();
    });

    it('returns a public log if one is found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      (scopedLog.log as PublicLog).contractAddress = contractAddress;

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
    });

    it('returns a private log if one is found', async () => {
      const scopedLog = await TxScopedL2Log.random(false);
      scopedLog.log.fields[0] = await siloPrivateLog(contractAddress, Fr.random());

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      const indexedTxEffect = await randomIndexedTxEffect();
      aztecNode.getTxEffect.mockResolvedValue(indexedTxEffect);

      aztecNode.getTxEffect.mockImplementation((txHash: TxHash) =>
        txHash.equals(scopedLog.txHash) ? Promise.resolve(indexedTxEffect) : Promise.resolve(undefined),
      );

      const request = new LogRetrievalRequest(contractAddress, scopedLog.log.fields[0]);

      const responses = await logService.bulkRetrieveLogs([request]);

      expect(responses.length).toEqual(1);
      expect(responses[0]).not.toBeNull();
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

      const result = await logService.getPublicLogByTag(tag, contractAddress);
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

      const result = (await logService.getPublicLogByTag(tag, logContractAddress))!;

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

      await expect(logService.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(/Got 2 logs for tag/);
    });

    it('throws if tx effect not found', async () => {
      const scopedLog = await TxScopedL2Log.random(true);
      aztecNode.getLogsByTags.mockResolvedValue([[scopedLog]]);
      aztecNode.getTxEffect.mockResolvedValue(undefined);
      const logContractAddress = (scopedLog.log as PublicLog).contractAddress;

      await expect(logService.getPublicLogByTag(tag, logContractAddress)).rejects.toThrow(
        /failed to retrieve tx effects/,
      );
    });

    it('returns log fields that are actually emitted', async () => {
      const logContractAddress = await AztecAddress.random();
      const logPlaintext = [Fr.random()];
      const logContent = [tag, ...logPlaintext];

      const log = PublicLog.from({
        contractAddress: logContractAddress,
        fields: logContent,
      });
      const scopedLogWithPadding = new TxScopedL2Log(
        TxHash.random(),
        randomInt(100),
        randomInt(100),
        BlockNumber(randomInt(100)),
        L2BlockHash.random(),
        0n,
        log,
      );

      aztecNode.getLogsByTags.mockResolvedValue([[scopedLogWithPadding]]);
      aztecNode.getTxEffect.mockResolvedValue(await randomIndexedTxEffect());

      const result = await logService.getPublicLogByTag(tag, logContractAddress);

      expect(result?.logPayload).toEqual(logPlaintext);
    });
  });
});
