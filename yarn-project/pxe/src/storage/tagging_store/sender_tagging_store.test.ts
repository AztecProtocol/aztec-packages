import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret, type PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/constants.js';
import { SenderTaggingStore } from './sender_tagging_store.js';

describe('SenderTaggingStore', () => {
  let taggingStore: SenderTaggingStore;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  beforeEach(async () => {
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('storePendingIndexes', () => {
    it('stores a single pending index', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await taggingStore.storePendingIndexes([preTag], txHash, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for different secrets', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret2, index: 7 },
      ];

      await taggingStore.storePendingIndexes(preTags, txHash, 'test');

      const txHashes1 = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash);

      const txHashes2 = await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10, 'test');
      expect(txHashes2).toHaveLength(1);
      expect(txHashes2[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash1);
      expect(txHashes).toContainEqual(txHash2);
    });

    it('ignores duplicate preTag + txHash combination', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await taggingStore.storePendingIndexes([preTag], txHash, 'test');
      await taggingStore.storePendingIndexes([preTag], txHash, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('throws when storing duplicate secrets in the same call', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret1, index: 7 },
      ];

      await expect(taggingStore.storePendingIndexes(preTags, txHash, 'test')).rejects.toThrow(
        'Duplicate secrets found when storing pending indexes',
      );
    });

    it('throws when storing a different index for an existing secret + txHash pair', async () => {
      const txHash = TxHash.random();

      // First store an index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash, 'test');

      // Try to store a different index for the same secret + txHash pair
      await expect(taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash, 'test')).rejects.toThrow(
        /Cannot store index 7.*a different index 5 already exists/,
      );
    });

    it('throws when storing a pending index lower than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Try to store a pending index lower than the finalized index
      await expect(taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, 'test')).rejects.toThrow(
        /Cannot store pending index 5.*lower than or equal to the last finalized index 10/,
      );
    });

    it('throws when storing a pending index equal to the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Try to store a pending index equal to the finalized index
      await expect(taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash2, 'test')).rejects.toThrow(
        /Cannot store pending index 10.*lower than or equal to the last finalized index 10/,
      );
    });

    it('allows storing a pending index higher than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Store a pending index higher than the finalized index - should succeed
      await expect(
        taggingStore.storePendingIndexes([{ secret: secret1, index: 15 }], txHash2, 'test'),
      ).resolves.not.toThrow();

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 20, 'test');
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
        await taggingStore.storePendingIndexes([{ secret: secret1, index: finalizedIndex }], txHash1, 'test');
        await taggingStore.finalizePendingIndexes([txHash1], 'test');

        // Try to store an index beyond the window
        await expect(
          taggingStore.storePendingIndexes([{ secret: secret1, index: indexBeyondWindow }], txHash2, 'test'),
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
        await taggingStore.storePendingIndexes([{ secret: secret1, index: finalizedIndex }], txHash1, 'test');
        await taggingStore.finalizePendingIndexes([txHash1], 'test');

        // Store an index at the boundary, but check is >, so it should succeed
        await expect(
          taggingStore.storePendingIndexes([{ secret: secret1, index: indexAtBoundary }], txHash2, 'test'),
        ).resolves.not.toThrow();

        const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, indexAtBoundary + 5, 'test');
        expect(txHashes).toHaveLength(1);
        expect(txHashes[0]).toEqual(txHash2);
      });
    });
  });

  describe('getTxHashesOfPendingIndexes', () => {
    it('returns empty array when no pending indexes exist', async () => {
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toEqual([]);
    });

    it('returns tx hashes for indexes within the specified range', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 8 }], txHash3, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 4, 9, 'test');
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash2);
      expect(txHashes).toContainEqual(txHash3);
      expect(txHashes).not.toContainEqual(txHash1);
    });

    it('includes startIndex and excludes endIndex (range is [startIndex, endIndex))', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 10 }], txHash2, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 5, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash1);
    });

    it('handles parallel pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const txHash4 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, 'test');
      // We store different secret with txHash1 to check we correctly don't return it in the result
      await taggingStore.storePendingIndexes([{ secret: secret2, index: 7 }], txHash1, 'test');
      // Store "parallel" index for secret1 with a different tx (can happen when sending logs from multiple PXEs)
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash4, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      // Should have 3 unique tx hashes for secret1
      expect(txHashes).toEqual(expect.arrayContaining([txHash1, txHash2, txHash3, txHash4]));
    });
  });

  describe('getLastFinalizedIndex', () => {
    it('returns undefined when no finalized index exists', async () => {
      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBeUndefined();
    });

    it('returns the last finalized index after finalizePendingIndexes', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash, 'test');
      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(5);
    });
  });

  describe('getLastUsedIndex', () => {
    it('returns undefined when no indexes exist', async () => {
      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBeUndefined();
    });

    it('returns the last finalized index when no pending indexes exist', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash, 'test');
      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(5);
    });

    it('returns the highest pending index when pending indexes exist', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First, finalize an index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Then add a higher pending index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(7);
    });

    it('returns the highest of multiple pending indexes', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash3, 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(7);
    });
  });

  describe('dropPendingIndexes', () => {
    it('removes all pending indexes for a given tx hash', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret2, index: 5 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');

      await taggingStore.dropPendingIndexes([txHash1], 'test');

      // txHash1 should be removed
      const txHashes1 = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash2);

      // txHash1 should also be removed from secret2
      const txHashes2 = await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10, 'test');
      expect(txHashes2).toEqual([]);
    });
  });

  describe('finalizePendingIndexes', () => {
    it('moves pending index to finalized for a given tx hash', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash, 'test');

      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(5);

      // Pending index should be removed
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toEqual([]);
    });

    it('updates finalized index to the higher value', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');
      await taggingStore.finalizePendingIndexes([txHash2], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(7);
    });

    it('does not update finalized index when newly finalized index is lower', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Store both pending indexes first
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash2, 'test');

      // Finalize the higher index first
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Then try to finalize the lower index
      await taggingStore.finalizePendingIndexes([txHash2], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(7); // Should remain at 7
    });

    it('prunes pending indexes with lower or equal index than finalized', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, 'test');

      // Finalize txHash2 (index 5)
      await taggingStore.finalizePendingIndexes([txHash2], 'test');

      // txHash1 (index 3) should be pruned as it's lower than finalized
      // txHash3 (index 7) should remain
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash3);
    });

    it('handles multiple secrets in the same tx', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes(
        [
          { secret: secret1, index: 3 },
          { secret: secret2, index: 7 },
        ],
        txHash,
        'test',
      );

      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastFinalized1 = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      const lastFinalized2 = await taggingStore.getLastFinalizedIndex(secret2, 'test');

      expect(lastFinalized1).toBe(3);
      expect(lastFinalized2).toBe(7);
    });

    it('does nothing when tx hash does not exist', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash, 'test');

      await taggingStore.finalizePendingIndexes([TxHash.random()], 'test');

      // Original pending index should still be there
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);

      // Finalized index should not be set
      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('handles a full lifecycle: pending -> finalized -> new pending', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Step 1: Add pending index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBeUndefined();

      // Step 2: Finalize the index
      await taggingStore.finalizePendingIndexes([txHash1], 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);

      // Step 3: Add a new higher pending index
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);

      // Step 4: Finalize the new index
      await taggingStore.finalizePendingIndexes([txHash2], 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(7);
    });

    it('handles dropped transactions', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, 'test');

      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(5);

      // Drop txHash2
      await taggingStore.dropPendingIndexes([txHash2], 'test');

      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(3);
    });

    it('handles multiple secrets with different lifecycles', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      // Secret1: pending -> finalized
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Secret2: pending (not finalized)
      await taggingStore.storePendingIndexes([{ secret: secret2, index: 5 }], txHash2, 'test');

      // Secret1: new pending
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, 'test');

      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret2, 'test')).toBeUndefined();
      expect(await taggingStore.getLastUsedIndex(secret2, 'test')).toBe(5);
    });
  });

  describe('staged writes', () => {
    it('writes of uncommitted jobs are not visible outside the job that makes them', async () => {
      const committedTxHash = TxHash.random();
      {
        const commitJobId: string = 'commit-job';
        await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], committedTxHash, commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const stagedTxHash = TxHash.random();
      const stagingJobId: string = 'staging-job';
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 5 }], stagedTxHash, stagingJobId);

      // For a job without any staged data we should only get committed data
      const txHashesWithoutJobId = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'no-data-job');
      expect(txHashesWithoutJobId).toHaveLength(1);
      expect(txHashesWithoutJobId[0]).toEqual(committedTxHash);

      // With stagingJobId, should get both committed and staged data
      const txHashesWithJobId = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, stagingJobId);
      expect(txHashesWithJobId).toHaveLength(2);
      expect(txHashesWithJobId).toContainEqual(committedTxHash);
      expect(txHashesWithJobId).toContainEqual(stagedTxHash);
    });

    it('job staged data is correctly isolated when storing and finalizing pending indexes', async () => {
      const txHash1 = TxHash.random();
      {
        const commitJobId: string = 'commit-job';
        await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, commitJobId);
        await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const txHash2 = TxHash.random();
      const stagingJobId: string = 'staging-job';

      // Stage a higher finalized index (not committed)
      await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, stagingJobId);
      await taggingStore.finalizePendingIndexes([txHash2], stagingJobId);

      // With a different jobId, should get the committed finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'no-data-job')).toBe(3);

      // With stagingJobId, should get the staged finalized index
      expect(await taggingStore.getLastFinalizedIndex(secret1, stagingJobId)).toBe(7);
    });

    it('discardStaged removes staged data without affecting persistent storage', async () => {
      {
        const txHash1 = TxHash.random();
        const txHash2 = TxHash.random();
        const commitJobId: string = 'commit-job';
        await taggingStore.storePendingIndexes([{ secret: secret1, index: 2 }], txHash1, commitJobId);
        await taggingStore.storePendingIndexes([{ secret: secret1, index: 3 }], txHash2, commitJobId);
        await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const stagingJobId: string = 'staging-job';
      {
        const txHash3 = TxHash.random();
        await taggingStore.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, stagingJobId);
        await taggingStore.finalizePendingIndexes([txHash3], stagingJobId);
        await taggingStore.discardStaged(stagingJobId);
      }

      // Should still get the committed finalized index
      expect(await taggingStore.getLastUsedIndex(secret1, 'no-data-job')).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'no-data-job')).toBe(2);

      // With stagingJobId should fall back to committed since staging was discarded
      expect(await taggingStore.getLastUsedIndex(secret1, stagingJobId)).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, stagingJobId)).toBe(2);
    });
  });
});
