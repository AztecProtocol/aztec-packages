import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { RevertCode } from '@aztec/stdlib/avm';
import {
  AppTaggingSecret,
  AppTaggingSecretKind,
  PrivateLog,
  SiloedTag,
  type TaggingIndexRange,
} from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/constants.js';
import { SenderTaggingStore } from './sender_tagging_store.js';

/** Helper to create a single-index range (lowestIndex === highestIndex). */
function range(secret: AppTaggingSecret, lowest: number, highest?: number): TaggingIndexRange {
  return { extendedSecret: secret, lowestIndex: lowest, highestIndex: highest ?? lowest };
}

describe('SenderTaggingStore', () => {
  let taggingStore: SenderTaggingStore;
  let secret1: AppTaggingSecret;
  let secret2: AppTaggingSecret;

  beforeEach(async () => {
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
    secret1 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    secret2 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
  });

  describe('storePendingIndexes', () => {
    it.each([
      ['', 'storePendingIndexes'],
      [' when merging', 'mergePendingIndexes'],
    ] as const)('stores a single pending index range for an untracked tx%s', async (_name, method) => {
      const txHash = TxHash.random();

      await taggingStore[method]([range(secret1, 5)], txHash, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toEqual([txHash]);
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(5);
    });

    it('stores multiple pending index ranges for different secrets', async () => {
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3), range(secret2, 7)], txHash, 'test');

      const txHashes1 = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes1).toHaveLength(1);
      expect(txHashes1[0]).toEqual(txHash);

      const txHashes2 = await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10, 'test');
      expect(txHashes2).toHaveLength(1);
      expect(txHashes2[0]).toEqual(txHash);
    });

    it('stores multiple pending index ranges for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash1);
      expect(txHashes).toContainEqual(txHash2);
    });

    it('ignores duplicate range + txHash combination', async () => {
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash);
    });

    it('stores a range spanning multiple indexes', async () => {
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3, 7)], txHash, 'test');

      // By design the txs are filtered based on the highestIndex (7) in getTxHashesOfPendingIndexes so we shouldn't
      // receive the tx only in the second query.
      const txHashesNotContainingHighest = await taggingStore.getTxHashesOfPendingIndexes(secret1, 3, 4, 'test');
      expect(txHashesNotContainingHighest).toHaveLength(0);

      const txHashesContainingHighest = await taggingStore.getTxHashesOfPendingIndexes(secret1, 7, 8, 'test');
      expect(txHashesContainingHighest).toHaveLength(1);
      expect(txHashesContainingHighest[0]).toEqual(txHash);

      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(7);
    });

    it('throws when storing a different range for an existing secret + txHash pair', async () => {
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');

      // Storing a different range for the same secret + txHash should throw
      await expect(taggingStore.storePendingIndexes([range(secret1, 7)], txHash, 'test')).rejects.toThrow(
        /Conflicting range/,
      );
    });

    it('keeps the existing range when merging in a sub-range for the same tx', async () => {
      const txHash = TxHash.random();

      // Prove-time entry spanning setup and app-logic phase logs.
      await taggingStore.storePendingIndexes([range(secret1, 4, 6)], txHash, 'test');

      // Discovery of the surviving sub-range of a partially reverted tx must not throw nor shrink the entry.
      await taggingStore.mergePendingIndexes([range(secret1, 4)], txHash, 'test');

      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(6);
    });

    it('widens the existing range to the union when merging in a range beyond it', async () => {
      const txHash = TxHash.random();

      // A prior window discovered only part of the tx's range.
      await taggingStore.storePendingIndexes([range(secret1, 4, 6)], txHash, 'test');

      // Discovery evidences further onchain indexes for the same tx — the entry must grow to cover them.
      await taggingStore.mergePendingIndexes([range(secret1, 7, 8)], txHash, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toEqual([txHash]);
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(8);
    });

    it('throws when storing a pending index range lower than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([range(secret1, 10)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Try to store a pending index lower than the finalized index
      await expect(taggingStore.storePendingIndexes([range(secret1, 5)], txHash2, 'test')).rejects.toThrow(
        /lowestIndex is lower than or equal to the last finalized index 10/,
      );
    });

    it('throws when storing a pending index range equal to the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([range(secret1, 10)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Try to store a pending index equal to the finalized index
      await expect(taggingStore.storePendingIndexes([range(secret1, 10)], txHash2, 'test')).rejects.toThrow(
        /lowestIndex is lower than or equal to the last finalized index 10/,
      );
    });

    it('allows storing a pending index higher than the last finalized index', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First store and finalize an index
      await taggingStore.storePendingIndexes([range(secret1, 10)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Store a pending index higher than the finalized index - should succeed
      await expect(taggingStore.storePendingIndexes([range(secret1, 15)], txHash2, 'test')).resolves.not.toThrow();

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
        await taggingStore.storePendingIndexes([range(secret1, finalizedIndex)], txHash1, 'test');
        await taggingStore.finalizePendingIndexes([txHash1], 'test');

        // Try to store an index beyond the window
        await expect(
          taggingStore.storePendingIndexes([range(secret1, indexBeyondWindow)], txHash2, 'test'),
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
        await taggingStore.storePendingIndexes([range(secret1, finalizedIndex)], txHash1, 'test');
        await taggingStore.finalizePendingIndexes([txHash1], 'test');

        // Store an index at the boundary, but check is >, so it should succeed
        await expect(
          taggingStore.storePendingIndexes([range(secret1, indexAtBoundary)], txHash2, 'test'),
        ).resolves.not.toThrow();

        const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, indexAtBoundary + 5, 'test');
        expect(txHashes).toHaveLength(1);
        expect(txHashes[0]).toEqual(txHash2);
      });

      it('allows an ordinary pending tx to stack on a fresh secret already at the MAX_PRIVATE_LOGS_PER_TX floor', async () => {
        const txHash1 = TxHash.random();
        const txHash2 = TxHash.random();

        // A single tx from a fresh secret (no finalized index yet) can legitimately reach MAX_PRIVATE_LOGS_PER_TX - 1,
        // since that's the tx-wide cap on private logs. Neither tx is finalized yet.
        await taggingStore.storePendingIndexes([range(secret1, 0, MAX_PRIVATE_LOGS_PER_TX - 1)], txHash1, 'test');

        // A second, ordinary-sized pending tx to the same secret must still be usable before the first tx is mined -
        // this is the margin UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN adds on top of MAX_PRIVATE_LOGS_PER_TX for.
        await expect(
          taggingStore.storePendingIndexes(
            [range(secret1, MAX_PRIVATE_LOGS_PER_TX, MAX_PRIVATE_LOGS_PER_TX + 5)],
            txHash2,
            'test',
          ),
        ).resolves.not.toThrow();
      });

      it('throws after pending txs exhaust window', async () => {
        // One single-index pending tx per index, mirroring how an un-mined backlog accumulates one log per tx on a
        // shared secret (e.g. the self-send chain in bench_build_block). With no index finalized yet, exactly
        // WINDOW_LEN indexes (0..WINDOW_LEN - 1) fit...
        for (let i = 0; i < UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN; i++) {
          await taggingStore.storePendingIndexes([range(secret1, i)], TxHash.random(), 'test');
        }

        // ...and the next tx throws, even with a single additional tag.
        await expect(
          taggingStore.storePendingIndexes(
            [range(secret1, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN)],
            TxHash.random(),
            'test',
          ),
        ).rejects.toThrow(/configured too low/);
      });

      it('permits exactly WINDOW_LEN pending indexes for a fresh secret', async () => {
        // Fresh-secret counterpart of the two boundary tests above: with no index finalized yet, the last permitted
        // pending index is WINDOW_LEN - 1, the same WINDOW_LEN-sized allowance as after any real finalization.
        await taggingStore.storePendingIndexes(
          [range(secret1, 0, MAX_PRIVATE_LOGS_PER_TX - 1)],
          TxHash.random(),
          'test',
        );
        await expect(
          taggingStore.storePendingIndexes(
            [range(secret1, MAX_PRIVATE_LOGS_PER_TX, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - 1)],
            TxHash.random(),
            'test',
          ),
        ).resolves.not.toThrow();

        await expect(
          taggingStore.storePendingIndexes(
            [range(secret1, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN)],
            TxHash.random(),
            'test',
          ),
        ).rejects.toThrow(/configured too low/);
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

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash2, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 8)], txHash3, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 4, 9, 'test');
      expect(txHashes).toHaveLength(2);
      expect(txHashes).toContainEqual(txHash2);
      expect(txHashes).toContainEqual(txHash3);
      expect(txHashes).not.toContainEqual(txHash1);
    });

    it('includes startIndex and excludes endIndex (range is [startIndex, endIndex))', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 10)], txHash2, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 5, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(txHash1);
    });

    it('handles parallel pending indexes for the same secret from different txs', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();
      const txHash4 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash2, 'test');
      // We store different secret with txHash1 to check we correctly don't return it in the result
      await taggingStore.storePendingIndexes([range(secret2, 7)], txHash1, 'test');
      // Store "parallel" index for secret1 with a different tx (can happen when sending logs from multiple PXEs)
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash3, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash4, 'test');

      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      // Should have 4 unique tx hashes for secret1
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
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');
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
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');
      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(5);
    });

    it('returns the highest pending index when pending indexes exist', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // First, finalize an index
      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Then add a higher pending index
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(7);
    });

    it('returns the highest of multiple pending indexes', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash3, 'test');

      const lastUsed = await taggingStore.getLastUsedIndex(secret1, 'test');
      expect(lastUsed).toBe(7);
    });
  });

  describe('dropPendingIndexes', () => {
    it('removes all pending indexes for a given tx hash', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret2, 5)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');

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
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash, 'test');

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

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');
      await taggingStore.finalizePendingIndexes([txHash2], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(7);
    });

    it('does not update finalized index when newly finalized index is lower', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();

      // Store both pending indexes first
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash2, 'test');

      // Finalize the higher index first
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Then try to finalize the lower index
      await taggingStore.finalizePendingIndexes([txHash2], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(7); // Should remain at 7
    });

    it('prunes pending indexes with lower or equal highestIndex than finalized', async () => {
      const txHash1 = TxHash.random();
      const txHash2 = TxHash.random();
      const txHash3 = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash2, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash3, 'test');

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
      await taggingStore.storePendingIndexes([range(secret1, 3), range(secret2, 7)], txHash, 'test');

      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastFinalized1 = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      const lastFinalized2 = await taggingStore.getLastFinalizedIndex(secret2, 'test');

      expect(lastFinalized1).toBe(3);
      expect(lastFinalized2).toBe(7);
    });

    it('finalizes the highestIndex of a range', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([range(secret1, 3, 7)], txHash, 'test');

      await taggingStore.finalizePendingIndexes([txHash], 'test');

      const lastFinalized = await taggingStore.getLastFinalizedIndex(secret1, 'test');
      expect(lastFinalized).toBe(7);
    });

    it('does nothing when tx hash does not exist', async () => {
      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash, 'test');

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
      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBeUndefined();

      // Step 2: Finalize the index
      await taggingStore.finalizePendingIndexes([txHash1], 'test');
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);

      // Step 3: Add a new higher pending index
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, 'test');
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

      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 5)], txHash2, 'test');

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
      await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Secret2: pending (not finalized)
      await taggingStore.storePendingIndexes([range(secret2, 5)], txHash2, 'test');

      // Secret1: new pending
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash3, 'test');

      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getLastUsedIndex(secret1, 'test')).toBe(7);
      expect(await taggingStore.getLastFinalizedIndex(secret2, 'test')).toBeUndefined();
      expect(await taggingStore.getLastUsedIndex(secret2, 'test')).toBe(5);
    });
  });

  describe('finalizePendingIndexesOfAPartiallyRevertedTx', () => {
    function makeTxEffect(txHash: TxHash, siloedTags: SiloedTag[]): TxEffect {
      return new TxEffect(
        RevertCode.REVERTED,
        txHash,
        Fr.ZERO,
        [Fr.random()], // noteHashes (at least 1 nullifier required below, not here)
        [Fr.random()], // nullifiers (at least 1 required)
        [], // l2ToL1Msgs
        [], // publicDataWrites
        siloedTags.map(tag => PrivateLog.random(tag.value)), // privateLogs with surviving tags
        [], // publicLogs
        [], // contractClassLogs
      );
    }

    it('finalizes only the indexes whose tags appear in TxEffect', async () => {
      const txHash = TxHash.random();

      // Store a range [3, 5] for secret1 in the same tx
      await taggingStore.storePendingIndexes([range(secret1, 3, 5)], txHash, 'test');

      // Compute the siloed tag for index 3 (the one that survives)
      const survivingTag = await SiloedTag.compute({ extendedSecret: secret1, index: 3 });
      const txEffect = makeTxEffect(txHash, [survivingTag]);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // Index 3 should be finalized (it was onchain)
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);
      // All pending indexes for this tx should be removed
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(0);
    });

    it('drops all indexes when no tags survive onchain', async () => {
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(secret1, 3, 5)], txHash, 'test');

      // TxEffect with no matching private logs (empty)
      const txEffect = makeTxEffect(txHash, []);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // No finalized index should be set
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBeUndefined();
      // All pending indexes for this tx should be removed
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(0);
    });

    it('handles multiple secrets affected by the same partially reverted tx', async () => {
      const txHash = TxHash.random();

      // Store pending index ranges for both secrets in the same tx
      await taggingStore.storePendingIndexes([range(secret1, 3, 5), range(secret2, 7)], txHash, 'test');

      // Only index 3 for secret1 survives onchain; other indexes for secret1 and secret2 are dropped
      const survivingTag = await SiloedTag.compute({ extendedSecret: secret1, index: 3 });
      const txEffect = makeTxEffect(txHash, [survivingTag]);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // secret1: index 3 should be finalized
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(3);
      expect(await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test')).toHaveLength(0);

      // secret2: no finalized index, all pending removed
      expect(await taggingStore.getLastFinalizedIndex(secret2, 'test')).toBeUndefined();
      expect(await taggingStore.getTxHashesOfPendingIndexes(secret2, 0, 10, 'test')).toHaveLength(0);
    });

    it('preserves pending indexes from other txs', async () => {
      const revertedTxHash = TxHash.random();
      const otherTxHash = TxHash.random();

      // Store pending indexes: one from reverted tx, one from another tx
      await taggingStore.storePendingIndexes([range(secret1, 3)], revertedTxHash, 'test');
      await taggingStore.storePendingIndexes([range(secret1, 7)], otherTxHash, 'test');

      // TxEffect with no surviving tags for the reverted tx
      const txEffect = makeTxEffect(revertedTxHash, []);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // No finalized index (nothing survived from the reverted tx)
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBeUndefined();
      // The other tx's pending index should still be there
      const txHashes = await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test');
      expect(txHashes).toHaveLength(1);
      expect(txHashes[0]).toEqual(otherTxHash);
    });

    it('correctly updates finalized index when there is an existing finalized index', async () => {
      const txHash1 = TxHash.random();
      const revertedTxHash = TxHash.random();

      // Store and finalize index 2
      await taggingStore.storePendingIndexes([range(secret1, 2)], txHash1, 'test');
      await taggingStore.finalizePendingIndexes([txHash1], 'test');

      // Store a pending range [4, 6] for a partially reverted tx
      await taggingStore.storePendingIndexes([range(secret1, 4, 6)], revertedTxHash, 'test');

      // Only index 4 survives
      const survivingTag = await SiloedTag.compute({ extendedSecret: secret1, index: 4 });
      const txEffect = makeTxEffect(revertedTxHash, [survivingTag]);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // Finalized index should be updated to 4 (higher than previous 2)
      expect(await taggingStore.getLastFinalizedIndex(secret1, 'test')).toBe(4);
      expect(await taggingStore.getTxHashesOfPendingIndexes(secret1, 0, 10, 'test')).toHaveLength(0);
    });

    it('recomputes siloed tags via the constrained domain separator for constrained-delivery secrets', async () => {
      const constrainedSecret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const txHash = TxHash.random();

      await taggingStore.storePendingIndexes([range(constrainedSecret, 3, 5)], txHash, 'test');

      // The onchain tag must be derived with the constrained log domain separator.
      const survivingTag = await SiloedTag.compute({ extendedSecret: constrainedSecret, index: 4 });
      const txEffect = makeTxEffect(txHash, [survivingTag]);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      expect(await taggingStore.getLastFinalizedIndex(constrainedSecret, 'test')).toBe(4);
      expect(await taggingStore.getTxHashesOfPendingIndexes(constrainedSecret, 0, 10, 'test')).toHaveLength(0);
    });

    // If an unconstrained tag (computed with the unconstrained domain separator) accidentally appears in a tx
    // effect alongside a pending range for the *same* underlying Fr but registered as a constrained secret, the
    // finalizer must not treat it as a surviving constrained-tag. The onchain emission would have used the
    // constrained domain separator, so the values are different.
    it('does not cross-match a tag computed under the wrong domain separator', async () => {
      const constrainedSecret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      const txHash = TxHash.random();
      await taggingStore.storePendingIndexes([range(constrainedSecret, 0, 2)], txHash, 'test');

      // Build an unconstrained twin whose `secret` field happens to equal the constrained secret's `secret`. Doing
      // this via the public construction path keeps the test independent of how the production code derives Frs.
      // Emit a tag using the *unconstrained* domain separator for the same Fr/index combination. This should NOT match.
      const wrongDomSepTag = await SiloedTag.compute({
        extendedSecret: new AppTaggingSecret(constrainedSecret.secret, constrainedSecret.app),
        index: 1,
      });
      const txEffect = makeTxEffect(txHash, [wrongDomSepTag]);

      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(txEffect, 'test');

      // No constrained index survived (the domain separator mismatch means the tag doesn't reconstruct).
      expect(await taggingStore.getLastFinalizedIndex(constrainedSecret, 'test')).toBeUndefined();
    });
  });

  describe('staged writes', () => {
    it('writes of uncommitted jobs are not visible outside the job that makes them', async () => {
      const committedTxHash = TxHash.random();
      {
        const commitJobId: string = 'commit-job';
        await taggingStore.storePendingIndexes([range(secret1, 3)], committedTxHash, commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const stagedTxHash = TxHash.random();
      const stagingJobId: string = 'staging-job';
      await taggingStore.storePendingIndexes([range(secret1, 5)], stagedTxHash, stagingJobId);

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
        await taggingStore.storePendingIndexes([range(secret1, 3)], txHash1, commitJobId);
        await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const txHash2 = TxHash.random();
      const stagingJobId: string = 'staging-job';

      // Stage a higher finalized index (not committed)
      await taggingStore.storePendingIndexes([range(secret1, 7)], txHash2, stagingJobId);
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
        await taggingStore.storePendingIndexes([range(secret1, 2)], txHash1, commitJobId);
        await taggingStore.storePendingIndexes([range(secret1, 3)], txHash2, commitJobId);
        await taggingStore.finalizePendingIndexes([txHash1], commitJobId);
        await taggingStore.commit(commitJobId);
      }

      const stagingJobId: string = 'staging-job';
      {
        const txHash3 = TxHash.random();
        await taggingStore.storePendingIndexes([range(secret1, 7)], txHash3, stagingJobId);
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
