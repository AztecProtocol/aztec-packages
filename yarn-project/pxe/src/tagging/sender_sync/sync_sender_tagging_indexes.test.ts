import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';
import { TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SenderTaggingDataProvider } from '../../storage/tagging_data_provider/sender_tagging_data_provider.js';
import { DirectionalAppTaggingSecret, SiloedTag, Tag, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../index.js';
import { syncSenderTaggingIndexes } from './sync_sender_tagging_indexes.js';

describe('syncSenderTaggingIndexes', () => {
  // Contract address and secret to be used on the input of the syncSenderTaggingIndexes function.
  let secret: DirectionalAppTaggingSecret;
  let contractAddress: AztecAddress;

  let aztecNode: MockProxy<AztecNode>;
  let taggingDataProvider: SenderTaggingDataProvider;

  async function computeSiloedTagForIndex(index: number) {
    const tag = await Tag.compute({ secret, index });
    return SiloedTag.compute(tag, contractAddress);
  }

  function makeLog(txHash: TxHash, tag: Fr) {
    return randomTxScopedPrivateL2Log({ txHash, tag });
  }

  async function setUp() {
    secret = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    contractAddress = await AztecAddress.random();

    aztecNode = mock<AztecNode>();
    taggingDataProvider = new SenderTaggingDataProvider(await openTmpStore('test'));
  }

  it('no new logs found for a given secret', async () => {
    await setUp();

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      // No log found for any tag
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    await syncSenderTaggingIndexes(secret, contractAddress, aztecNode, taggingDataProvider);

    // Highest used and finalized indexes should stay undefined
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBeUndefined();
    expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBeUndefined();
  });

  // These tests need to be run together in sequence.
  describe('sequential tests', () => {
    const finalizedIndexStep1 = 3;
    const finalizedBlockNumberStep1 = 15;

    const pendingTxHashStep2 = TxHash.random();
    const pendingIndexStep2 = 5;

    beforeAll(async () => {
      await setUp();
    });

    it('step 1: highest finalized index is updated', async () => {
      // Create a log with tag index 3
      const index3Tag = await computeSiloedTagForIndex(finalizedIndexStep1);

      aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
        // Return empty arrays for all tags except the one at index 3
        return Promise.resolve(
          tags.map((tag: SiloedTag) => (tag.equals(index3Tag) ? [makeLog(TxHash.random(), index3Tag.value)] : [])),
        );
      });

      // Mock getTxReceipt to return a successful, finalized tx (finalized because it is included in a block before
      // the finalized block)
      aztecNode.getTxReceipt.mockResolvedValue({
        status: TxStatus.SUCCESS,
        blockNumber: finalizedBlockNumberStep1 - 1,
      } as any);

      // Mock getL2Tips to return a finalized block number >= the tx block number
      aztecNode.getL2Tips.mockResolvedValue({
        finalized: { number: finalizedBlockNumberStep1 },
      } as any);

      await syncSenderTaggingIndexes(secret, contractAddress, aztecNode, taggingDataProvider);

      // Verify the highest finalized index is updated to 3
      expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBe(finalizedIndexStep1);
      // Verify the highest used index also returns 3 (when there is no higher pending index the highest used index is
      // the highest finalized index).
      expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(finalizedIndexStep1);
    });

    it('step 2: pending log is synced', async () => {
      const pendingTag = await computeSiloedTagForIndex(pendingIndexStep2);

      aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
        // Return empty arrays for all tags except the one at the pending index
        return Promise.resolve(
          tags.map((tag: SiloedTag) => (tag.equals(pendingTag) ? [makeLog(pendingTxHashStep2, pendingTag.value)] : [])),
        );
      });

      // Mock getTxReceipt to return a successful but still pending tx
      aztecNode.getTxReceipt.mockResolvedValue({
        status: TxStatus.SUCCESS,
        blockNumber: finalizedBlockNumberStep1 + 1,
      } as any);

      aztecNode.getL2Tips.mockResolvedValue({
        finalized: { number: finalizedBlockNumberStep1 },
      } as any);

      await syncSenderTaggingIndexes(secret, contractAddress, aztecNode, taggingDataProvider);

      // Verify the highest finalized index was not updated
      expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBe(finalizedIndexStep1);
      // Verify the highest used index was updated to the pending index
      expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(pendingIndexStep2);
    });

    it('step 3: syncs logs across 2 windows', async () => {
      // Move finalized block into the future
      const newFinalizedBlockNumber = finalizedBlockNumberStep1 + 5;
      const newHighestFinalizedIndex = finalizedIndexStep1 + 4;
      const newHighestUsedIndex = newHighestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;

      // Create tx hashes for new logs
      const newHighestFinalizedTxHash = TxHash.random();
      const newHighestUsedTxHash = TxHash.random();

      // Create tags for multiple indices across 2 windows
      const nowFinalizedTag = await computeSiloedTagForIndex(pendingIndexStep2); // Previously pending, now finalized
      const newHighestFinalizedTag = await computeSiloedTagForIndex(newHighestFinalizedIndex); // New finalized log
      const newHighestUsedTag = await computeSiloedTagForIndex(newHighestUsedIndex); // New pending log

      // Mock getPrivateLogsByTags to return logs for multiple indices
      aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
        return Promise.resolve(
          tags.map((tag: SiloedTag) => {
            if (tag.equals(nowFinalizedTag)) {
              return [makeLog(pendingTxHashStep2, nowFinalizedTag.value)];
            } else if (tag.equals(newHighestFinalizedTag)) {
              return [makeLog(newHighestFinalizedTxHash, newHighestFinalizedTag.value)];
            } else if (tag.equals(newHighestUsedTag)) {
              return [makeLog(newHighestUsedTxHash, newHighestUsedTag.value)];
            }
            return [];
          }),
        );
      });

      // Mock getTxReceipt to return appropriate statuses
      aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
        if (hash.equals(pendingTxHashStep2)) {
          // The previously pending tx (index pendingIndexStep2) is now finalized
          return {
            status: TxStatus.SUCCESS,
            blockNumber: newFinalizedBlockNumber - 3,
          } as any;
        } else if (hash.equals(newHighestFinalizedTxHash)) {
          // This tx (index newHighestFinalizedIndex) is finalized
          return {
            status: TxStatus.SUCCESS,
            blockNumber: newFinalizedBlockNumber - 2,
          } as any;
        } else if (hash.equals(newHighestUsedTxHash)) {
          // This tx (index newHighestUsedIndex) is pending
          return {
            status: TxStatus.SUCCESS,
            blockNumber: newFinalizedBlockNumber + 2,
          } as any;
        } else {
          throw new Error(`Unexpected tx hash: ${hash.toString()}`);
        }
      });

      // Mock getL2Tips with the new finalized block number
      aztecNode.getL2Tips.mockResolvedValue({
        finalized: { number: newFinalizedBlockNumber },
      } as any);

      await syncSenderTaggingIndexes(secret, contractAddress, aztecNode, taggingDataProvider);

      expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBe(newHighestFinalizedIndex);
      expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(newHighestUsedIndex);
    });
  });

  /**
   * This test verifies that when multiple logs use the same tag, we correctly bump the finalized index. With this
   * test we make sure we don't accidentally ignore the duplicate log.
   */
  it('handles pending and finalized logs found at the same index', async () => {
    await setUp();

    const finalizedTxHash = TxHash.random();
    const pendingTxHash = TxHash.random();

    const finalizedBlockNumber = 15;
    const pendingAndFinalizedIndex = 3;

    const index3Tag = await computeSiloedTagForIndex(pendingAndFinalizedIndex);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      // Return both the pending and finalized logs for the tag at index 3
      return Promise.resolve(
        tags.map((tag: SiloedTag) =>
          tag.equals(index3Tag)
            ? [makeLog(pendingTxHash, index3Tag.value), makeLog(finalizedTxHash, index3Tag.value)]
            : [],
        ),
      );
    });

    aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
      if (hash.equals(finalizedTxHash)) {
        return {
          status: TxStatus.SUCCESS,
          blockNumber: finalizedBlockNumber - 1, // Finalized tx
        } as any;
      } else if (hash.equals(pendingTxHash)) {
        return {
          status: TxStatus.SUCCESS,
          blockNumber: finalizedBlockNumber + 1, // Pending tx
        } as any;
      } else {
        throw new Error(`Unexpected tx hash: ${hash.toString()}`);
      }
    });

    aztecNode.getL2Tips.mockResolvedValue({
      finalized: { number: finalizedBlockNumber },
    } as any);

    // Sync tagged logs
    await syncSenderTaggingIndexes(secret, contractAddress, aztecNode, taggingDataProvider);

    // Verify that both highest finalized and highest used were set to the pending and finalized index
    expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBe(pendingAndFinalizedIndex);
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(pendingAndFinalizedIndex);
  });
});
