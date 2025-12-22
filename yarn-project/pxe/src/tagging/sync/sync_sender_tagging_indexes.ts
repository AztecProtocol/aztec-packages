import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import type { SenderTaggingDataProvider } from '../../storage/tagging_data_provider/sender_tagging_data_provider.js';
import { getStatusChangeOfPending } from './utils/get_status_change_of_pending.js';
import { loadAndStoreNewTaggingIndexes } from './utils/load_and_store_new_tagging_indexes.js';

// This window has to be as large as the largest expected number of logs emitted in a tx for a given directional app
// tagging secret. If we get more tag indexes consumed than this window, an error is thrown in `PXE::proveTx` function.
// This is set to a larger value than MAX_PRIVATE_LOGS_PER_TX (currently 64) because there could be more than
// MAX_PRIVATE_LOGS_PER_TX indexes consumed in case the logs are squashed. This happens when the log contains a note
// and the note is nullified in the same tx.
//
// Rationale for value 95:
// - The `e2e_pending_note_hashes_contract` test's "Should handle overflowing the kernel data structures in nested
//   calls" test case hits 95 tagging indexes emitted in a single transaction. This test creates and nullifies many
//   notes recursively to test kernel reset circuit behavior, which causes logs to be squashed but still consume
//   tagging indexes during the sync process. Since this is testing MAX_PRIVATE_LOGS_PER_TX overflow we can be
//   reasonably certain that this value is large enough for standard use cases.
// - This value is below MAX_RPC_LEN (100) which is the limit for array parameters in the JSON RPC schema for
//   `getLogsByTags`. Any test that would perform sync over JSON RPC (not by having access to the Aztec node instance
//   directly) would error out if that maximum was hit (docs_examples.test.ts is an example of this).
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = 95;

/**
 * Syncs tagging indexes. This function needs to be called whenever a private log is being sent.
 *
 * @param secret - The secret that's unique for (sender, recipient, contract) tuple while the direction of
 * sender -> recipient matters.
 * @param app - The address of the contract that the logs are tagged for. Needs to be provided because we perform
 * second round of siloing in this function which is necessary because kernels do it as well (they silo first field
 * of the private log which corresponds to the tag).
 * @remarks When syncing the indexes as sender we don't care about the log contents - we only care about the highest
 * pending and highest finalized indexes as that guides the next index choice when sending a log. The next index choice
 * is simply the highest pending index plus one (or finalized if pending is undefined).
 * @dev This function looks for new indexes, adds them to pending, then it checks status of each pending index and
 * updates its status accordingly.
 */
export async function syncSenderTaggingIndexes(
  secret: DirectionalAppTaggingSecret,
  app: AztecAddress,
  aztecNode: AztecNode,
  taggingDataProvider: SenderTaggingDataProvider,
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

  const finalizedIndex = await taggingDataProvider.getLastFinalizedIndex(secret);

  let start = finalizedIndex === undefined ? 0 : finalizedIndex + 1;
  let end = start + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;

  let previousFinalizedIndex = finalizedIndex;
  let newFinalizedIndex = undefined;

  while (true) {
    // Load and store indexes for the current window. These indexes may already exist in the database if txs using
    // them were previously sent from this PXE. Any duplicates are handled by the tagging data provider.
    await loadAndStoreNewTaggingIndexes(secret, app, start, end, aztecNode, taggingDataProvider);

    // Retrieve all indexes within the current window from storage and update their status accordingly.
    const pendingTxHashes = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, start, end);
    if (pendingTxHashes.length === 0) {
      break;
    }

    const { txHashesToFinalize, txHashesToDrop } = await getStatusChangeOfPending(pendingTxHashes, aztecNode);

    await taggingDataProvider.dropPendingIndexes(txHashesToDrop);
    await taggingDataProvider.finalizePendingIndexes(txHashesToFinalize);

    // We check if the finalized index has been updated.
    newFinalizedIndex = await taggingDataProvider.getLastFinalizedIndex(secret);
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
