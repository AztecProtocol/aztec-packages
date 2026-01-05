import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret, type PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { JobContext } from '../../job_coordinator/index.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/sync/sync_sender_tagging_indexes.js';
import { SenderTaggingDataProvider } from './sender_tagging_data_provider.js';

describe('SenderTaggingDataProvider', () => {
  let taggingDataProvider: SenderTaggingDataProvider;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  beforeEach(async () => {
    taggingDataProvider = new SenderTaggingDataProvider(await openTmpStore('test'));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('storePendingIndexes', () => {
    it('stores a single pending index', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await taggingDataProvider.storePendingIndexes([preTag], txHash);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for different secrets', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret2, index: 7 },
      ];

      await taggingDataProvider.storePendingIndexes(preTags, txHash);

      const txHashes1 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash);

      const txHashes2 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret2, 0, 10);
      expect(txHashes2).toHaveLength(1);
      expect(txHashes2[0]).toEqual(txHash);
    });

    it('stores multiple pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash1);
      expect(txHashes).toContainEqual(txHash2);
    });

    it('ignores duplicate preTag + txHash combination', async () => {
      const txHash = TxHash.random();
      const preTag: PreTag = { secret: secret1, index: 5 };

      await taggingDataProvider.storePendingIndexes([preTag], txHash);
      await taggingDataProvider.storePendingIndexes([preTag], txHash);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('throws when storing duplicate secrets in the same call', async () => {
      const txHash = TxHash.random();
      const preTags: PreTag[] = [
        { secret: secret1, index: 3 },
        { secret: secret1, index: 7 },
      ];

      await expect(taggingDataProvider.storePendingIndexes(preTags, txHash)).rejects.toThrow(
        'Duplicate secrets found when storing pending indexes',
      );
    });

    it('throws when storing a different index for an existing secret + txHash pair', async () => {
      const txHash = TxHash.random();

      // First store an index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash);

      // Try to store a different index for the same secret + txHash pair
      await expect(taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash)).rejects.toThrow(
        /Cannot store index 7.*a different index 5 already exists/,
      );
    });

    it('throws when storing a pending index lower than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Try to store a pending index lower than the finalized index
      await expect(taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2)).rejects.toThrow(
        /Cannot store pending index 5.*lower than or equal to the last finalized index 10/,
      );
    });

    it('throws when storing a pending index equal to the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Try to store a pending index equal to the finalized index
      await expect(taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 10 }], txHash2)).rejects.toThrow(
        /Cannot store pending index 10.*lower than or equal to the last finalized index 10/,
      );
    });

    it('allows storing a pending index higher than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 10 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Store a pending index higher than the finalized index - should succeed
      await expect(
        taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 15 }], txHash2),
      ).resolves.not.toThrow();

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 20);
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
        await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: finalizedIndex }], txHash1);
        await taggingDataProvider.finalizePendingIndexes([txHash1]);

        // Try to store an index beyond the window
        await expect(
          taggingDataProvider.storePendingIndexes([{ secret: secret1, index: indexBeyondWindow }], txHash2),
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
        await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: finalizedIndex }], txHash1);
        await taggingDataProvider.finalizePendingIndexes([txHash1]);

        // Store an index at the boundary, but check is >, so it should succeed
        await expect(
          taggingDataProvider.storePendingIndexes([{ secret: secret1, index: indexAtBoundary }], txHash2),
        ).resolves.not.toThrow();

        const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, indexAtBoundary + 5);
        expect(txHashes).toHaveLength(1);
        expect(txHashes[0]).toEqual(txHash2);
      });
    });
  });

  describe('getTxHashesOfPendingIndexes', () => {
    it('returns empty array when no pending indexes exist', async () => {
      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toEqual([]);
    });

    it('returns tx hashes for indexes within the specified range', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 8 }], txHash3);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 4, 9);
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash2);
      expect(txHashes).toContainEqual(txHash3);
      expect(txHashes).not.toContainEqual(txHash1);
    });

    it('includes startIndex and excludes endIndex (range is [startIndex, endIndex))', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 10 }], txHash2);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 5, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash1);
    });

    it('handles parallel pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const txHash4 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2);
      // We store different secret with txHash1 to check we correctly don't return it in the result
      await taggingDataProvider.storePendingIndexes([{ secret: secret2, index: 7 }], txHash1);
      // Store "parallel" index for secret1 with a different tx (can happen when sending logs from multiple PXEs)
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash4);

      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      // Should have 3 unique tx hashes for secret1
      expect(txHashes).toEqual(expect.arrayContaining([txHash1, txHash2, txHash3, txHash4]));
    });
  });

  describe('getLastFinalizedIndex', () => {
    it('returns undefined when no finalized index exists', async () => {
      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBeUndefined();
    });

    it('returns the last finalized index after finalizePendingIndexes', async () => {
      const txHash = TxHash.random();
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash);
      await taggingDataProvider.finalizePendingIndexes([txHash]);

      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(5);
    });
  });

  describe('getLastUsedIndex', () => {
    it('returns undefined when no indexes exist', async () => {
      const lastUsed = await taggingDataProvider.getLastUsedIndex(secret1);
      expect(lastUsed).toBeUndefined();
    });

    it('returns the last finalized index when no pending indexes exist', async () => {
      const txHash = TxHash.random();
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash);
      await taggingDataProvider.finalizePendingIndexes([txHash]);

      const lastUsed = await taggingDataProvider.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(5);
    });

    it('returns the highest pending index when pending indexes exist', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First, finalize an index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Then add a higher pending index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);

      const lastUsed = await taggingDataProvider.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(7);
    });

    it('returns the highest of multiple pending indexes', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash3);

      const lastUsed = await taggingDataProvider.getLastUsedIndex(secret1);
      expect(lastUsed).toBe(7);
    });
  });

  describe('dropPendingIndexes', () => {
    it('removes all pending indexes for a given tx hash', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret2, index: 5 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);

      await taggingDataProvider.dropPendingIndexes([txHash1]);

      // txHash1 should be removed
      const txHashes1 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash2);

      // txHash1 should also be removed from secret2
      const txHashes2 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret2, 0, 10);
      expect(txHashes2).toEqual([]);
    });
  });

  describe('finalizePendingIndexes', () => {
    it('moves pending index to finalized for a given tx hash', async () => {
      const txHash = TxHash.random();
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash);

      await taggingDataProvider.finalizePendingIndexes([txHash]);

      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(5);

      // Pending index should be removed
      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toEqual([]);
    });

    it('updates finalized index to the higher value', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);
      await taggingDataProvider.finalizePendingIndexes([txHash2]);

      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(7);
    });

    it('does not update finalized index when newly finalized index is lower', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Store both pending indexes first
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash2);

      // Finalize the higher index first
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Then try to finalize the lower index
      await taggingDataProvider.finalizePendingIndexes([txHash2]);

      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBe(7); // Should remain at 7
    });

    it('prunes pending indexes with lower or equal index than finalized', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3);

      // Finalize txHash2 (index 5)
      await taggingDataProvider.finalizePendingIndexes([txHash2]);

      // txHash1 (index 3) should be pruned as it's lower than finalized
      // txHash3 (index 7) should remain
      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash3);
    });

    it('handles multiple secrets in the same tx', async () => {
      const txHash = TxHash.random();
      await taggingDataProvider.storePendingIndexes(
        [
          { secret: secret1, index: 3 },
          { secret: secret2, index: 7 },
        ],
        txHash,
      );

      await taggingDataProvider.finalizePendingIndexes([txHash]);

      const lastFinalized1 = await taggingDataProvider.getLastFinalizedIndex(secret1);
      const lastFinalized2 = await taggingDataProvider.getLastFinalizedIndex(secret2);

      expect(lastFinalized1).toBe(3);
      expect(lastFinalized2).toBe(7);
    });

    it('does nothing when tx hash does not exist', async () => {
      const txHash = TxHash.random();
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash);

      await taggingDataProvider.finalizePendingIndexes([TxHash.random()]);

      // Original pending index should still be there
      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashes).toHaveLength(1);

      // Finalized index should not be set
      const lastFinalized = await taggingDataProvider.getLastFinalizedIndex(secret1);
      expect(lastFinalized).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('handles a full lifecycle: pending -> finalized -> new pending', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Step 1: Add pending index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(3);
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBeUndefined();

      // Step 2: Finalize the index
      await taggingDataProvider.finalizePendingIndexes([txHash1]);
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(3);
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(3);

      // Step 3: Add a new higher pending index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2);
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(3);

      // Step 4: Finalize the new index
      await taggingDataProvider.finalizePendingIndexes([txHash2]);
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(7);
    });

    it('handles dropped transactions', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2);

      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(5);

      // Drop txHash2
      await taggingDataProvider.dropPendingIndexes([txHash2]);

      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(3);
    });

    it('handles multiple secrets with different lifecycles', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      // Secret1: pending -> finalized
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Secret2: pending (not finalized)
      await taggingDataProvider.storePendingIndexes([{ secret: secret2, index: 5 }], txHash2);

      // Secret1: new pending
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3);

      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(3);
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(7);
      expect(await taggingDataProvider.getLastFinalizedIndex(secret2)).toBeUndefined();
      expect(await taggingDataProvider.getLastUsedIndex(secret2)).toBe(5);
    });
  });

  describe('staging', () => {
    it('writes to staging when context provided', async () => {
      const committedTxHash = TxHash.random();
      const stagedTxHash = TxHash.random();
      const context = new JobContext('test123', 'test');

      // First set committed data
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], committedTxHash);

      // Then set staged data
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], stagedTxHash, context);

      // Without context, should only get committed data
      const txHashesWithoutContext = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10);
      expect(txHashesWithoutContext).toHaveLength(1);
      expect(txHashesWithoutContext[0]).toEqual(committedTxHash);

      // With context, should get both committed and staged data
      const txHashesWithContext = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10, context);
      expect(txHashesWithContext).toHaveLength(2);
      expect(txHashesWithContext).toContainEqual(committedTxHash);
      expect(txHashesWithContext).toContainEqual(stagedTxHash);
    });

    it('stages finalized indexes separately', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const context = new JobContext('test123', 'test');

      // First commit some data without staging
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      // Stage a higher finalized index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, context);
      await taggingDataProvider.finalizePendingIndexes([txHash2], context);

      // Without context, should get the committed finalized index
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(3);

      // With context, should get the staged finalized index
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1, context)).toBe(7);
    });

    it('commitStaged promotes staged data to main', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const context = new JobContext('test123', 'test');

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, context);
      await taggingDataProvider.finalizePendingIndexes([txHash2], context);
      context.registerWrite(taggingDataProvider.storeName);

      // Commit the staging
      await taggingDataProvider.commitStaged(context);

      // Now without context should get the previously staged data
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(7);
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const context = new JobContext('test123', 'test');

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);
      await taggingDataProvider.finalizePendingIndexes([txHash1]);

      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash2, context);
      await taggingDataProvider.finalizePendingIndexes([txHash2], context);

      // Discard the staging
      await taggingDataProvider.discardStaged(context.stagingPrefix);

      // Should still get the committed finalized index
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBe(3);

      // With context should fall back to committed since staging was discarded
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1, context)).toBe(3);
    });

    it('stages pending and finalized index operations independently', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const context = new JobContext('test123', 'test');

      // Committed: index 3 pending
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1);

      // Staged: index 5 pending, then finalize it
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, context);
      await taggingDataProvider.finalizePendingIndexes([txHash2], context);

      // Staged: add another pending index
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 7 }], txHash3, context);

      // Without context:
      // - Should see pending: txHash1 (index 3)
      // - No finalized index
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1)).toBeUndefined();
      expect(await taggingDataProvider.getLastUsedIndex(secret1)).toBe(3);

      // With context:
      // - Should see finalized: 5
      // - Should see pending: txHash1 (index 3), txHash3 (index 7)
      // - Last used should be max(finalized=5, pending={3,7}) = 7
      expect(await taggingDataProvider.getLastFinalizedIndex(secret1, context)).toBe(5);
      expect(await taggingDataProvider.getLastUsedIndex(secret1, context)).toBe(7);
    });

    it('drops pending indexes in staging correctly', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const context = new JobContext('test123', 'test');

      // Store both pending indexes with staging
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 3 }], txHash1, context);
      await taggingDataProvider.storePendingIndexes([{ secret: secret1, index: 5 }], txHash2, context);

      // Drop one in staging
      await taggingDataProvider.dropPendingIndexes([txHash1], context);

      // With context, should only see txHash2
      const txHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret1, 0, 10, context);
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash2);
    });
  });
});
