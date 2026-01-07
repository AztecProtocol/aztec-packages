import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret, type PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/index.js';
import { SenderTaggingStore } from './sender_tagging_store.js';

const TEST_JOB_ID = 'test-job';

describe('SenderTaggingStore', () => {
  let taggingStore: SenderTaggingStore;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  // Helper functions that write and commit in one step
  const storeAndCommit = async (preTags: PreTag[], txHash: TxHash) => {
    await taggingStore.storePendingIndexes(preTags, txHash, TEST_JOB_ID);
    await taggingStore.commit(TEST_JOB_ID);
  };

  const dropAndCommit = async (txHashes: TxHash[]) => {
    await taggingStore.dropPendingIndexes(txHashes, TEST_JOB_ID);
    await taggingStore.commit(TEST_JOB_ID);
  };

  const finalizeAndCommit = async (txHashes: TxHash[]) => {
    await taggingStore.finalizePendingIndexes(txHashes, TEST_JOB_ID);
    await taggingStore.commit(TEST_JOB_ID);
  };

  beforeEach(async () => {
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('storePendingIndexes', () => {
    it('stores a single pending index', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await storeAndCommit([preTag], txHash);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for different secrets', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret2, index: 7 },
      ];

      await storeAndCommit(preTags, txHash);

      const txHashes1 = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash);

      const txHashes2 = await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10);
      expect(txHashes2).toHaveLength(1);
      expect(txHashes2[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash1);
      expect(txHashes).toContainEqual(txHash2);
    });

    it('ignores duplicate preTag + txHash combination', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await storeAndCommit([preTag], txHash);
      await storeAndCommit([preTag], txHash);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('throws when storing duplicate secrets in the same call', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret1, index: 7 },
      ];

      await expect(taggingStore.storePendingIndexes(preTags, txHash, TEST_JOB_ID)).rejects.toThrow(
        'Duplicate secrets found when storing pending indexes',
      );
    });

    it('throws when storing a different index for an existing secret + txHash pair', async () => {
      const txHash = TxHash.random();

      // First store an index
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash);

      // Try to store a different index for the same secret + txHash pair
      await expect(
        taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash, TEST_JOB_ID),
      ).rejects.toThrow(/Cannot store index 7.*a different index 5 already exists/);
    });

    it('throws when storing a pending index lower than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await storeAndCommit([{ secret: secret1, index: 10 }], txHash1);
      await finalizeAndCommit([txHash1]);

      // Try to store a pending index lower than the finalized index
      await expect(
        taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, TEST_JOB_ID),
      ).rejects.toThrow(/Cannot store pending index 5.*lower than or equal to the last finalized index 10/);
    });

    it('throws when storing a pending index equal to the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await storeAndCommit([{ secret: secret1, index: 10 }], txHash1);
      await finalizeAndCommit([txHash1]);

      // Try to store a pending index equal to the finalized index
      await expect(
        taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash2, TEST_JOB_ID),
      ).rejects.toThrow(/Cannot store pending index 10.*lower than or equal to the last finalized index 10/);
    });

    it('allows storing a pending index higher than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await storeAndCommit([{ secret: secret1, index: 10 }], txHash1);
      await finalizeAndCommit([txHash1]);

      // Store a pending index higher than the finalized index - should succeed
      await storeAndCommit([{ secret: secret1, index: 15 }], txHash2);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 20);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash2);
    });

    describe('window length validation', () => {
      it('throws when storing an index beyond window length from finalized index', async () => {
        const txHash1 = TxHash.random();
        const txHash2 = TxHash.random();
        const finalizedIndex = 10;
        const indexBeyondWindow = finalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;

        // First store and finalize an index
        await storeAndCommit([{ secret: secret1, index: finalizedIndex }], txHash1);
        await finalizeAndCommit([txHash1]);

        // Try to store an index beyond the window
        await expect(
          taggingStore.storePendingIndexes([{ secret: secret1, index: indexBeyondWindow }], txHash2, TEST_JOB_ID),
        ).rejects.toThrow(
          `Highest used index ${indexBeyondWindow} is further than window length from the highest finalized index ${finalizedIndex}`,
        );
      });

      it('allows storing an index at the window boundary from finalized index', async () => {
        const txHash1 = TxHash.random();
        const txHash2 = TxHash.random();
        const finalizedIndex = 10;
        const indexAtBoundary = finalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;

        // First store and finalize an index
        await storeAndCommit([{ secret: secret1, index: finalizedIndex }], txHash1);
        await finalizeAndCommit([txHash1]);

        // Store an index at the boundary, but check is >, so it should succeed
        await storeAndCommit([{ secret: secret1, index: indexAtBoundary }], txHash2);

        const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, indexAtBoundary + 5);
        expect(txHashes).toHaveLength(1);
        expect(txHashes[0]).toEqual(txHash2);
      });
    });
  });

  describe('getTxHashesOfPendingIndexes', () => {
    it('returns empty array when no pending indexes exist', async () => {
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toEqual([]);
    });

    it('returns tx hashes for indexes within the specified range', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash2);
      await storeAndCommit([{ secret: secret1, index: 8 }], txHash3);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 4, 9);
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash2);
      expect(txHashes).toContainEqual(txHash3);
      expect(txHashes).not.toContainEqual(txHash1);
    });

    it('includes startIndex and excludes endIndex (range is [startIndex, endIndex))', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 5 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 10 }], txHash2);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 5, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash1);
    });

    it('handles parallel pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const txHash4 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash2);
      // We store different secret with txHash1 to check we correctly don't return it in the result
      await storeAndCommit([{ secret: secret2, index: 7 }], txHash1);
      // Store "parallel" index for secret1 with a different tx (can happen when sending logs from multiple PXEs)
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash3);
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash4);

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      // Should have 3 unique tx hashes for secret1
      expect(txHashes).toEqual(expect.arrayContaining([txHash1, txHash2, txHash3, txHash4]));
    });
  });

  describe('getLastFinalizedIndex', () => {
    it('returns undefined when no finalized index exists', async () => {
      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBeUndefined();
    });

    it('returns the last finalized index after finalizePendingIndexes', async () => {
      const txHash = TxHash.random();
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash);
      await finalizeAndCommit([txHash]);

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(5);
    });
  });

  describe('getLastUsedIndex', () => {
    it('returns undefined when no indexes exist', async () => {
      const lastUsed = await taggingStore.getLastUsedIndex(secret1);
      expect(lastUsed).toBeUndefined();
    });

    it('returns the last finalized index when no pending indexes exist', async () => {
      const txHash = TxHash.random();
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash);
      await finalizeAndCommit([txHash]);

      const lastUsed = await taggingStore.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(5);
    });

    it('returns the highest pending index when pending indexes exist', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First, finalize an index
      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await finalizeAndCommit([txHash1]);

      // Then add a higher pending index
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);

      const lastUsed = await taggingStore.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(7);
    });

    it('returns the highest of multiple pending indexes', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash3);

      const lastUsed = await taggingStore.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(7);
    });
  });

  describe('dropPendingIndexes', () => {
    it('removes all pending indexes for a given tx hash', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret2, index: 5 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);

      await dropAndCommit([txHash1]);

      // txHash1 should be removed
      const txHashes1 = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash2);

      // txHash1 should also be removed from secret2
      const txHashes2 = await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10);
      expect(txHashes2).toEqual([]);
    });
  });

  describe('finalizePendingIndexes', () => {
    it('moves pending index to finalized for a given tx hash', async () => {
      const txHash = TxHash.random();
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash);

      await finalizeAndCommit([txHash]);

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(5);

      // Pending index should be removed
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toEqual([]);
    });

    it('updates finalized index to the higher value', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await finalizeAndCommit([txHash1]);

      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);
      await finalizeAndCommit([txHash2]);

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(7);
    });

    it('does not update finalized index when newly finalized index is lower', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Store both pending indexes first
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 3 }], txHash2);

      // Finalize the higher index first
      await finalizeAndCommit([txHash1]);

      // Then try to finalize the lower index
      await finalizeAndCommit([txHash2]);

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(7); // Should remain at 7
    });

    it('prunes pending indexes with lower or equal index than finalized', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash2);
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash3);

      // Finalize txHash2 (index 5)
      await finalizeAndCommit([txHash2]);

      // txHash1 (index 3) should be pruned as it's lower than finalized
      // txHash3 (index 7) should remain
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash3);
    });

    it('handles multiple secrets in the same tx', async () => {
      const txHash = TxHash.random();
      await storeAndCommit(
        [
          { secret: secret1, index: 3 },
          { secret: secret2, index: 7 },
        ],
        txHash,
      );

      await finalizeAndCommit([txHash]);

      const lastFinalized1 = await taggingStore.getLastFinalizedIndex(secret1);
      const lastFinalized2 = await taggingStore.getLastFinalizedIndex(secret2);

      expect(lastFinalized1).toBe(3);
      expect(lastFinalized2).toBe(7);
    });

    it('does nothing when tx hash does not exist', async () => {
      const txHash = TxHash.random();
      await storeAndCommit([{ secret: secret1, index: 3 }], txHash);

      await finalizeAndCommit([TxHash.random()]);

      // Original pending index should still be there
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);

      // Finalized index should not be set
      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('handles a full lifecycle: pending -> finalized -> new pending', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Step 1: Add pending index
      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBeUndefined();

      // Step 2: Finalize the index
      await finalizeAndCommit([txHash1]);
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(3);

      // Step 3: Add a new higher pending index
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash2);
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(3);

      // Step 4: Finalize the new index
      await finalizeAndCommit([txHash2]);
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(7);
    });

    it('handles dropped transactions', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await storeAndCommit([{ secret: secret1, index: 5 }], txHash2);

      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(5);

      // Drop txHash2
      await dropAndCommit([txHash2]);

      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(3);
    });

    it('handles multiple secrets with different lifecycles', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      // Secret1: pending -> finalized
      await storeAndCommit([{ secret: secret1, index: 3 }], txHash1);
      await finalizeAndCommit([txHash1]);

      // Secret2: pending (not finalized)
      await storeAndCommit([{ secret: secret2, index: 5 }], txHash2);

      // Secret1: new pending
      await storeAndCommit([{ secret: secret1, index: 7 }], txHash3);

      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(3);
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret2)).toBeUndefined();
      expect(await taggingStore.getLastUsedIndex(secret2)).toBe(5);
    });
  });

  describe('staging', () => {
    it('writes to staging when jobId provided', async () => {
      const committedTxHash = TxHash.random();
      const stagedTxHash = TxHash.random();
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // First set committed data
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], committedTxHash, commitJobId);
      await taggingStore.commit(commitJobId);

      // Then set staged data (not committed)
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], stagedTxHash, stagingJobId);

      // Without jobId, should only get committed data
      const txHashesWithoutJobId = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashesWithoutJobId).toHaveLength(1);
      expect(txHashesWithoutJobId[0]).toEqual(committedTxHash);

      // With stagingJobId, should get both committed and staged data
      const txHashesWithJobId = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, stagingJobId);
      expect(txHashesWithJobId).toHaveLength(2);
      expect(txHashesWithJobId).toContainEqual(committedTxHash);
      expect(txHashesWithJobId).toContainEqual(stagedTxHash);
    });

    it('stages finalized indexes separately', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // First commit some data
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, commitJobId);
      await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
      await taggingStore.commit(commitJobId);

      // Stage a higher finalized index (not committed)
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, stagingJobId);
      await taggingStore.finalizePendingIndexes([txHash2], stagingJobId);

      // Without jobId, should get the committed finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(3);

      // With stagingJobId, should get the staged finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1, stagingJobId)).toBe(7);
    });

    it('commit promotes staged data to main', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, commitJobId);
      await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
      await taggingStore.commit(commitJobId);

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, stagingJobId);
      await taggingStore.finalizePendingIndexes([txHash2], stagingJobId);

      // Commit the staging
      await taggingStore.commit(stagingJobId);

      // Now without jobId should get the previously staged data
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(7);
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, commitJobId);
      await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
      await taggingStore.commit(commitJobId);

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, stagingJobId);
      await taggingStore.finalizePendingIndexes([txHash2], stagingJobId);

      // Discard the staging
      await taggingStore.discardStaged(stagingJobId);

      // Should still get the committed finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBe(3);

      // With stagingJobId should fall back to committed since staging was discarded
      expect(await taggingStore.getLastFinalizedIndex(secret1, stagingJobId)).toBe(3);
    });

    it('stages pending and finalized index operations independently', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // Committed: index 3 pending
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, commitJobId);
      await taggingStore.commit(commitJobId);

      // Staged: index 5 pending, then finalize it
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, stagingJobId);
      await taggingStore.finalizePendingIndexes([txHash2], stagingJobId);

      // Staged: add another pending index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, stagingJobId);

      // Without jobId:
      // - Should see pending: txHash1 (index 3)
      // - No finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1)).toBeUndefined();
      expect(await taggingStore.getLastUsedIndex(secret1)).toBe(3);

      // With stagingJobId:
      // - Should see finalized: 5
      // - Should see pending: txHash1 (index 3), txHash3 (index 7)
      // - Last used should be max(finalized=5, pending={3,7}) = 7
      expect(await taggingStore.getLastFinalizedIndex(secret1, stagingJobId)).toBe(5);
      expect(await taggingStore.getLastUsedIndex(secret1, stagingJobId)).toBe(7);
    });

    it('drops pending indexes in staging correctly', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const stagingJobId: string = 'staging-job';

      // Store both pending indexes with staging
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, stagingJobId);
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, stagingJobId);

      // Drop one in staging
      await taggingStore.dropPendingIndexes([txHash1], stagingJobId);

      // With stagingJobId, should only see txHash2
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, stagingJobId);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash2);
    });
  });
});
