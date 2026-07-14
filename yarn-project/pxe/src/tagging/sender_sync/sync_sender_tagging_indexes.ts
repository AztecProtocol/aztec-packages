import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { AppTaggingSecret } from '@aztec/stdlib/logs';

import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../constants.js';
import {
  EMPTY_STATUS_CHANGE,
  getStatusChangeOfPending,
  mergeStatusChanges,
} from './utils/get_status_change_of_pending.js';
import { loadAndStoreNewTaggingIndexes } from './utils/load_and_store_new_tagging_indexes.js';

/**
 * Syncs tagging indexes. This function needs to be called whenever a private log is being sent.
 *
 * @param secret - The sender-side tagging `AppTaggingSecret`.
 * @remarks When syncing the indexes as sender we don't care about the log contents - we only care about the highest
 * pending and highest finalized indexes as that guides the next index choice when sending a log. The next index choice
 * is simply the highest pending index plus one (or finalized if pending is undefined).
 * @dev This function looks for new indexes, adds them to pending, then it checks status of each pending index and
 * updates its status accordingly.
 */
export async function syncSenderTaggingIndexes(
  secret: AppTaggingSecret,
  aztecNode: AztecNode,
  taggingStore: SenderTaggingStore,
  anchorBlockHash: BlockHash,
  jobId: string,
): Promise<void> {
  // # Explanation of how syncing works
  //
  // When choosing an index, we select: highest pending index + 1 (or highest finalized index + 1 if no pending).
  // If the chosen index is more than WINDOW_LEN from the highest finalized index, we throw an error. By having this
  // hard limit we give a guarantee to a recipient that he doesn't need to look further than WINDOW_LEN ahead of the
  // highest finalized index.
  //
  // This function synchronizes the finalized and pending indexes by iteratively querying the node for a window of
  // indexes at a time, storing all those indexes as pending, and then checking the status of each pending index to
  // update its finalization status accordingly. If we stumble upon a window with no indexes, we stop the loop.
  //
  // Stopping at that point is safe because of the limit described above - there can never be an index that is more
  // than WINDOW_LEN from the highest finalized index.
  //
  // # Note on performance
  // Each window advance requires two queries (logs + tx status). For example, syncing indexes 0–500 with a window of
  // 100 takes at least 10 round trips (5 windows × 2 queries).

  const finalizedIndex = await taggingStore.getLastFinalizedIndex(secret, jobId);

  let start = finalizedIndex === undefined ? 0 : finalizedIndex + 1;
  // The store permits pending indexes up to (lastFinalizedIndex ?? 0) + WINDOW_LEN inclusive, and the loop below only
  // advances past its first window on a finalized-index change, so the first window must cover that entire bound
  // (same formula as the window advance below). With nothing finalized, `start + WINDOW_LEN` would be one index
  // short of it, leaving a still-pending tx at the boundary index undiscovered.
  let end = (finalizedIndex ?? 0) + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;

  let previousFinalizedIndex = finalizedIndex;
  let newFinalizedIndex = undefined;

  while (true) {
    // Pending tx hashes already in the store for this window (from prior syncs or txs this PXE itself sent).
    // Reading these before issuing any RPC lets us fetch their receipts in parallel with the logs query below.
    const knownPendingTxHashes = await taggingStore.getTxHashesOfPendingIndexes(secret, start, end, jobId);

    // Fire the logs query and the known-pending receipts query in parallel
    const [, statusOfKnown] = await Promise.all([
      loadAndStoreNewTaggingIndexes(secret, start, end, aztecNode, taggingStore, anchorBlockHash, jobId),
      knownPendingTxHashes.length > 0
        ? getStatusChangeOfPending(knownPendingTxHashes, aztecNode)
        : Promise.resolve(EMPTY_STATUS_CHANGE),
    ]);

    // Re-read pending tx hashes after the logs query writes any newly-discovered ones to the store.
    const allPendingTxHashes = await taggingStore.getTxHashesOfPendingIndexes(secret, start, end, jobId);
    if (allPendingTxHashes.length === 0) {
      break;
    }

    // Receipts for pending tx hashes that the logs query just surfaced still need a sequential follow-up call.
    // `mergePendingIndexes` is idempotent on (secret, txHash), so a re-discovered hash stays classified as known
    // and is not re-fetched here.
    const knownSet = new Set(knownPendingTxHashes.map(h => h.toString()));
    const newPendingTxHashes = allPendingTxHashes.filter(h => !knownSet.has(h.toString()));

    const statusOfNew =
      newPendingTxHashes.length > 0
        ? await getStatusChangeOfPending(newPendingTxHashes, aztecNode)
        : EMPTY_STATUS_CHANGE;

    const { txHashesToFinalize, txHashesToDrop, txHashesWithExecutionReverted } = mergeStatusChanges(
      statusOfKnown,
      statusOfNew,
    );

    await taggingStore.dropPendingIndexes(txHashesToDrop, jobId);
    await taggingStore.finalizePendingIndexes(txHashesToFinalize, jobId);

    if (txHashesWithExecutionReverted.length > 0) {
      const receipts = await Promise.all(
        txHashesWithExecutionReverted.map(txHash => aztecNode.getTxReceipt(txHash, { includeTxEffect: true })),
      );
      for (const receipt of receipts) {
        if (!receipt.isMined() || !receipt.txEffect) {
          throw new Error(
            'TxEffect not found for execution-reverted tx. This is either a bug or a reorg has occurred.',
          );
        }

        await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(receipt.txEffect, jobId);
      }
    }

    // We check if the finalized index has been updated.
    newFinalizedIndex = await taggingStore.getLastFinalizedIndex(secret, jobId);
    if (previousFinalizedIndex !== newFinalizedIndex) {
      // A new finalized index was found, so we'll run the loop again. For example:
      // - Previous finalized index: 10
      // - New finalized index: 13
      // - Window length: 10
      //
      // In the last iteration, we processed indexes 11-20. To avoid reprocessing the same logs,
      // we'll only look at the new indexes 21-23:
      //
      //    Previous window: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
      //    New window:                                             [21, 22, 23]

      const previousEnd = end;
      // Add 1 because `end` is exclusive and the known finalized index is not included in the window.
      end = newFinalizedIndex! + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;
      start = previousEnd;
      previousFinalizedIndex = newFinalizedIndex;
    } else {
      // No new finalized index was found, so we don't need to process the next window.
      break;
    }
  }
}
