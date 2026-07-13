import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { RevertCode } from '@aztec/stdlib/avm';
import { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { AppTaggingSecretKind, PrivateLog } from '@aztec/stdlib/logs';
import { randomAppTaggingSecret, randomPrivateLogResult } from '@aztec/stdlib/testing';
import { MinedTxReceipt, type MinedTxStatus, TxEffect, TxExecutionResult, TxHash, TxStatus } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { type AppTaggingSecret, SiloedTag, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../index.js';
import { syncSenderTaggingIndexes } from './sync_sender_tagging_indexes.js';

const MOCK_ANCHOR_BLOCK_HASH = BlockHash.random();

describe('syncSenderTaggingIndexes', () => {
  // The secret to be used on the input of the syncSenderTaggingIndexes function.
  let secret: AppTaggingSecret;

  let aztecNode: MockProxy<AztecNode>;
  let taggingStore: SenderTaggingStore;

  const mined = (
    txHash: TxHash,
    status: MinedTxStatus,
    blockNumber: number,
    executionResult = TxExecutionResult.SUCCESS,
    txEffect?: TxEffect,
  ): MinedTxReceipt =>
    new MinedTxReceipt(
      txHash,
      status,
      executionResult,
      1n,
      BlockHash.random(),
      BlockNumber(blockNumber),
      SlotNumber(Number(blockNumber)),
      0,
      EpochNumber(1),
      txEffect,
    );

  function computeSiloedTagForIndex(index: number) {
    return SiloedTag.compute({ extendedSecret: secret, index });
  }

  function makeLog(txHash: TxHash, tag: Fr) {
    return randomPrivateLogResult({ txHash, tag });
  }

  async function setUp() {
    secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    aztecNode = mock<AztecNode>();
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
  }

  it('no new logs found for a given secret', async () => {
    await setUp();

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      // No log found for any tag
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // Highest used and finalized indexes should stay undefined
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBeUndefined();
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBeUndefined();
  });

  it('updates the highest finalized index for a constrained secret', async () => {
    await setUp();
    // Override unconstrained secret from `setUp`
    secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

    const finalizedIndex = 3;
    const finalizedTag = await computeSiloedTagForIndex(finalizedIndex);
    const finalizedTxHash = TxHash.random();

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(
        tags.map((tag: SiloedTag) => (tag.equals(finalizedTag) ? [makeLog(finalizedTxHash, finalizedTag.value)] : [])),
      );
    });

    aztecNode.getTxReceipt.mockResolvedValue(mined(finalizedTxHash, TxStatus.FINALIZED, 14));

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(finalizedIndex);
  });

  // These tests need to be run together in sequence.
  describe('sequential tests', () => {
    const finalizedIndexStep1 = 3;

    const pendingTxHashStep2 = TxHash.random();
    const pendingIndexStep2 = 5;

    beforeAll(async () => {
      await setUp();
    });

    it('step 1: highest finalized index is updated', async () => {
      // Create a log with tag index 3
      const index3Tag = await computeSiloedTagForIndex(finalizedIndexStep1);
      const finalizedTxHash = TxHash.random();

      aztecNode.getPrivateLogsByTags.mockImplementation(query => {
        const tags = query.tags as SiloedTag[];
        // Return empty arrays for all tags except the one at index 3
        return Promise.resolve(
          tags.map((tag: SiloedTag) => (tag.equals(index3Tag) ? [makeLog(finalizedTxHash, index3Tag.value)] : [])),
        );
      });

      // Mock getTxReceipt to return a finalized and successful tx
      aztecNode.getTxReceipt.mockResolvedValue(mined(finalizedTxHash, TxStatus.FINALIZED, 14));

      await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

      // Verify the highest finalized index is updated to 3
      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndexStep1);
      // Verify the highest used index also returns 3 (when there is no higher pending index the highest used index is
      // the highest finalized index).
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(finalizedIndexStep1);
    });

    it('step 2: pending log is synced', async () => {
      const pendingTag = await computeSiloedTagForIndex(pendingIndexStep2);

      aztecNode.getPrivateLogsByTags.mockImplementation(query => {
        const tags = query.tags as SiloedTag[];
        // Return empty arrays for all tags except the one at the pending index
        return Promise.resolve(
          tags.map((tag: SiloedTag) => (tag.equals(pendingTag) ? [makeLog(pendingTxHashStep2, pendingTag.value)] : [])),
        );
      });

      // Mock getTxReceipt to return a proposed (mined but not finalized) tx
      aztecNode.getTxReceipt.mockResolvedValue(mined(pendingTxHashStep2, TxStatus.PROPOSED, 16));

      await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

      // Verify the highest finalized index was not updated
      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(finalizedIndexStep1);
      // Verify the highest used index was updated to the pending index
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingIndexStep2);
    });

    it('step 3: syncs logs across 2 windows', async () => {
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
      aztecNode.getPrivateLogsByTags.mockImplementation(query => {
        const tags = query.tags as SiloedTag[];
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
          return Promise.resolve(mined(hash, TxStatus.FINALIZED, 17));
        } else if (hash.equals(newHighestFinalizedTxHash)) {
          // This tx (index newHighestFinalizedIndex) is finalized
          return Promise.resolve(mined(hash, TxStatus.FINALIZED, 18));
        } else if (hash.equals(newHighestUsedTxHash)) {
          // This tx (index newHighestUsedIndex) is pending (mined but not finalized)
          return Promise.resolve(mined(hash, TxStatus.PROPOSED, 22));
        } else {
          throw new Error(`Unexpected tx hash: ${hash.toString()}`);
        }
      });

      await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

      expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(newHighestFinalizedIndex);
      expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(newHighestUsedIndex);
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

    const pendingAndFinalizedIndex = 3;

    const index3Tag = await computeSiloedTagForIndex(pendingAndFinalizedIndex);

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
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
        return Promise.resolve(mined(hash, TxStatus.FINALIZED, 14));
      } else if (hash.equals(pendingTxHash)) {
        return Promise.resolve(mined(hash, TxStatus.PROPOSED, 16));
      } else {
        throw new Error(`Unexpected tx hash: ${hash.toString()}`);
      }
    });

    // Sync tagged logs
    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // Verify that both highest finalized and highest used were set to the pending and finalized index
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingAndFinalizedIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingAndFinalizedIndex);
  });

  /**
   * Covers the dominant wallet-resimulation scenario: a tx was sent (or previously discovered) in an earlier sync,
   * so the pending entry is already in the store. A subsequent sync against an anchor block where that tx is now
   * finalized must still advance the finalized index even though no new logs are found in the window.
   */
  it('finalizes pre-existing pending entries even when no new logs are found', async () => {
    await setUp();

    const pendingIndex = 4;
    const pendingTxHash = TxHash.random();

    // Seed the store with a pending entry, mirroring what a prior sync (or a tx sent from this PXE) would have written.
    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: pendingIndex, highestIndex: pendingIndex }],
      pendingTxHash,
      'test',
    );

    // No new logs surfaced in this window.
    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(tags.map(() => []));
    });

    // The seeded tx is now finalized onchain.
    aztecNode.getTxReceipt.mockResolvedValue(mined(pendingTxHash, TxStatus.FINALIZED, 14));

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(pendingIndex);
    // Window 1 finalizes the seeded entry; window 2 finds nothing and breaks → 2 logs calls.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
    // Single receipt call, issued in parallel with window 1's logs query.
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledWith(pendingTxHash);
  });

  /**
   * When the store has no pending entries and the logs query returns nothing, the sync should not issue any
   * receipt RPC at all.
   */
  it('does not call getTxReceipt when no pending entries exist and no new logs are found', async () => {
    await setUp();

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(tags.map(() => []));
    });

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // Single window iteration: empty result breaks the loop immediately.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    expect(aztecNode.getTxReceipt).not.toHaveBeenCalled();
  });

  /**
   * Mixed window: one pending entry is already in the store, and the logs query surfaces a different pending tx
   * at another index in the same window. Both must have their status reconciled in one sync call.
   */
  it('fetches receipts for both pre-existing and newly discovered pending in the same window', async () => {
    await setUp();

    const preExistingIndex = 3;
    const newlyDiscoveredIndex = 7;
    const preExistingTxHash = TxHash.random();
    const newlyDiscoveredTxHash = TxHash.random();
    const newlyDiscoveredTag = await computeSiloedTagForIndex(newlyDiscoveredIndex);

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: preExistingIndex, highestIndex: preExistingIndex }],
      preExistingTxHash,
      'test',
    );

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(
        tags.map((tag: SiloedTag) =>
          tag.equals(newlyDiscoveredTag) ? [makeLog(newlyDiscoveredTxHash, newlyDiscoveredTag.value)] : [],
        ),
      );
    });

    aztecNode.getTxReceipt.mockImplementation((hash: TxHash) => {
      if (hash.equals(preExistingTxHash) || hash.equals(newlyDiscoveredTxHash)) {
        return Promise.resolve(mined(hash, TxStatus.FINALIZED, 14));
      }
      throw new Error(`Unexpected tx hash: ${hash.toString()}`);
    });

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(newlyDiscoveredIndex);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(newlyDiscoveredIndex);
    // Window 1 reconciles both pendings; window 2 finds nothing and breaks → 2 logs calls.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
    // One parallel receipt call for the known pending, one sequential follow-up for the newly discovered.
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(2);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledWith(preExistingTxHash);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledWith(newlyDiscoveredTxHash);
  });

  /**
   * When the logs query re-discovers a tx hash that is already pending in the store (idempotent re-write),
   * we must not double-fetch its receipt — the diff between known and newly-discovered pending must filter it out.
   */
  it('does not re-fetch receipts when the logs query rediscovers a pre-existing pending tx', async () => {
    await setUp();

    const pendingIndex = 5;
    const pendingTxHash = TxHash.random();
    const pendingTag = await computeSiloedTagForIndex(pendingIndex);

    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: pendingIndex, highestIndex: pendingIndex }],
      pendingTxHash,
      'test',
    );

    // Logs query returns the same tx for the same tag — `storePendingIndexes` will treat this as a no-op duplicate.
    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(
        tags.map((tag: SiloedTag) => (tag.equals(pendingTag) ? [makeLog(pendingTxHash, pendingTag.value)] : [])),
      );
    });

    aztecNode.getTxReceipt.mockResolvedValue(mined(pendingTxHash, TxStatus.FINALIZED, 14));

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(pendingIndex);
    // Window 1 finalizes the rediscovered entry; window 2 finds nothing and breaks → 2 logs calls.
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
    // Only the parallel receipt call fires — the rediscovered hash is filtered out of the second-pass query.
    expect(aztecNode.getTxReceipt).toHaveBeenCalledTimes(1);
    expect(aztecNode.getTxReceipt).toHaveBeenCalledWith(pendingTxHash);
  });

  /**
   * Same-PXE partial revert: the pending range was recorded at prove time and spans both the non-revertible (setup)
   * and revertible (app logic) phases. After the tx mines with reverted app logic, only the setup-phase logs are
   * onchain, so discovery re-derives a narrower range for the same (secret, txHash). That narrower range must not
   * conflict with the prove-time entry — receipt reconciliation owns resolving the difference.
   */
  it('reconciles a partially reverted tx whose pending range was recorded at prove time', async () => {
    await setUp();

    const revertedTxHash = TxHash.random();

    // Prove-time persist: logs at indexes 4 (setup phase) through 6 (app logic phase) under the same secret.
    await taggingStore.storePendingIndexes(
      [{ extendedSecret: secret, lowestIndex: 4, highestIndex: 6 }],
      revertedTxHash,
      'test',
    );

    // Only the setup-phase log survived the revert, so the node only knows the tag at index 4.
    const tag4 = await computeSiloedTagForIndex(4);

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(
        tags.map((tag: SiloedTag) => (tag.equals(tag4) ? [makeLog(revertedTxHash, tag4.value)] : [])),
      );
    });

    const txEffect = new TxEffect(
      RevertCode.REVERTED,
      revertedTxHash,
      Fr.ZERO,
      [Fr.random()], // noteHashes
      [Fr.random()], // nullifiers
      [], // l2ToL1Msgs
      [], // publicDataWrites
      [PrivateLog.random(tag4.value)], // only the tag at index 4 survived
      [], // publicLogs
      [], // contractClassLogs
    );

    aztecNode.getTxReceipt.mockResolvedValue(
      mined(revertedTxHash, TxStatus.FINALIZED, 14, TxExecutionResult.REVERTED, txEffect),
    );

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // The surviving index is finalized and the squashed indexes 5-6 are freed for reuse.
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(4);
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(4);
  });

  it('handles a partially reverted transaction', async () => {
    await setUp();

    const revertedTxHash = TxHash.random();

    // Create logs at indexes 4 and 6 for the same (reverted) tx
    const tag4 = await computeSiloedTagForIndex(4);
    const tag6 = await computeSiloedTagForIndex(6);

    aztecNode.getPrivateLogsByTags.mockImplementation(query => {
      const tags = query.tags as SiloedTag[];
      return Promise.resolve(
        tags.map((tag: SiloedTag) => {
          if (tag.equals(tag4)) {
            return [makeLog(revertedTxHash, tag4.value)];
          } else if (tag.equals(tag6)) {
            return [makeLog(revertedTxHash, tag6.value)];
          }
          return [];
        }),
      );
    });

    // The TxEffect where only the tag at index 4 survived (non-revertible phase). The sync reads it off the receipt
    // via getTxReceipt(txHash, { includeTxEffect: true }).
    const txEffect = new TxEffect(
      RevertCode.REVERTED,
      revertedTxHash,
      Fr.ZERO,
      [Fr.random()], // noteHashes
      [Fr.random()], // nullifiers
      [], // l2ToL1Msgs
      [], // publicDataWrites
      [PrivateLog.random(tag4.value)], // only the tag at index 4 survived
      [], // publicLogs
      [], // contractClassLogs
    );

    // Mock getTxReceipt to return a FINALIZED + REVERTED mined receipt carrying the tx effect. The same receipt
    // satisfies both the status-classification call and the includeTxEffect follow-up call.
    aztecNode.getTxReceipt.mockResolvedValue(
      mined(revertedTxHash, TxStatus.FINALIZED, 14, TxExecutionResult.REVERTED, txEffect),
    );

    await syncSenderTaggingIndexes(secret, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // Index 4 should be finalized (it survived the partial revert)
    expect(await taggingStore.getLastFinalizedIndex(secret, 'test')).toBe(4);
    // No pending indexes should remain for this secret
    expect(await taggingStore.getLastUsedIndex(secret, 'test')).toBe(4);
  });
});
