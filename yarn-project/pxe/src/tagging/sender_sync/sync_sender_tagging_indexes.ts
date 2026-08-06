import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { AppTaggingSecret } from '@aztec/stdlib/logs';

import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { unfinalizedTaggingIndexesWindowEnd } from '../constants.js';
import type { LogQueryAnchor } from '../get_all_logs_by_tags.js';
import { loadAndStoreNewTaggingIndexes } from './utils/load_and_store_new_tagging_indexes.js';
import { resolvePendingTxs } from './utils/resolve_pending_txs.js';

/**
 * Syncs tagging indexes. This function needs to be called whenever a private log is being sent.
 *
 * @param secret - The sender-side tagging `AppTaggingSecret`.
 * @param finalizedBlockNumber - The locally-synced finalized tip, used to tell whether the block a discovered log
 * sits in is finalized.
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
  finalizedBlockNumber: BlockNumber,
  anchor: LogQueryAnchor,
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
  // A window advance usually takes a single logs query: the finalization status of most txs the logs surface is
  // derived from the log block numbers and the locally-synced finalized tip, without a per-tx node call. See
  // `resolvePendingTxs` for the txs that the logs cannot settle and what they cost.

  const finalizedIndex = await taggingStore.getLastFinalizedIndex(secret, jobId);

  let start = finalizedIndex === undefined ? 0 : finalizedIndex + 1;
  // The loop only extends the window when the finalized index moves,
  // so this first window must cover the entire permitted range on its own.
  let end = unfinalizedTaggingIndexesWindowEnd(finalizedIndex);

  let previousFinalizedIndex = finalizedIndex;
  let newFinalizedIndex = undefined;

  while (true) {
    const txsInLogs = await loadAndStoreNewTaggingIndexes(secret, start, end, aztecNode, taggingStore, anchor, jobId);

    // Pending txs for this window: prior syncs, txs this PXE itself sent, and what the logs just stored.
    const pendingTxs = await taggingStore.getPendingTxs(secret, start, end, jobId);
    if (pendingTxs.length === 0) {
      break;
    }

    const { txHashesFinalizedFromLogs, txHashesFinalizedFromReceipts, txHashesDropped, receiptsWithExecutionReverted } =
      await resolvePendingTxs(pendingTxs, txsInLogs, finalizedBlockNumber, aztecNode);

    await taggingStore.dropPendingIndexes(txHashesDropped, jobId);
    // The logs are queried per secret, so they only evidence this one's indexes. A receipt covers the whole tx.
    await taggingStore.finalizePendingIndexesOfSecret(secret, txHashesFinalizedFromLogs, jobId);
    await taggingStore.finalizePendingIndexes(txHashesFinalizedFromReceipts, jobId);

    for (const receipt of receiptsWithExecutionReverted) {
      await taggingStore.finalizePendingIndexesOfAPartiallyRevertedTx(receipt.txEffect, jobId);
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
      end = unfinalizedTaggingIndexesWindowEnd(newFinalizedIndex);
      start = previousEnd;
      previousFinalizedIndex = newFinalizedIndex;
    } else {
      // No new finalized index was found, so we don't need to process the next window.
      break;
    }
  }
}
