import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { DirectionalAppTaggingSecret, TxScopedL2Log } from '@aztec/stdlib/logs';

import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../constants.js';
import { findHighestIndexes } from './utils/find_highest_indexes.js';
import { loadLogsForRange } from './utils/load_logs_for_range.js';

/**
 * Loads private logs for `app` and  sender-recipient pair defined by `secret` and updates the highest aged and
 * finalized indexes in the db. At most load logs from blocks up to and including `anchorBlockNumber`.
 *
 * @dev This function can be safely executed "in parallel" for other sender-recipient pairs because the data in
 * in the tagging data provider is indexed by the secret and hence completely disjoint.
 */
export async function loadPrivateLogsForSenderRecipientPair(
  secret: DirectionalAppTaggingSecret,
  app: AztecAddress,
  aztecNode: AztecNode,
  taggingStore: RecipientTaggingStore,
  anchorBlockNumber: BlockNumber,
  anchorBlockHash: BlockHash,
  jobId: string,
): Promise<TxScopedL2Log[]> {
  // # Explanation of how the algorithm works
  // When we perform the sync we will look at logs that correspond to the tagging index range
  // (highestAgedIndex, highestFinalizedIndex + WINDOW_LEN]
  //
  // highestAgedIndex is the highest index that was used in a tx that is included in a block at least
  //                  `MAX_TX_LIFETIME` seconds ago.
  // highestFinalizedIndex is the highest index that was used in a tx that is included in a finalized block.
  //
  // "(" denotes an open end of the range - the index is not included in the range.
  // "]" denotes a closed end of the range - the index is included in the range.
  //
  // ## Explanation of highestAgedIndex
  //
  // highestAgedIndex is chosen such that for all tagging indexes `i <= highestAgedIndex` we know that no new logs can
  // ever appear.
  //
  // This relies on the "maximum inclusion timestamp" rule enforced by the kernel and rollup circuits:
  // - a transaction's maximum inclusion timestamp is at most `MAX_TX_LIFETIME` seconds after
  //   the timestamp of its anchor block; and
  // - a rollup only includes transactions whose inclusion timestamp is >= the L2 block's timestamp.
  //
  // Suppose some device used index `I` in a transaction anchored to block `B_N` at time `N`, and that block is now at
  // least `MAX_TX_LIFETIME` seconds in the past. Then there is no possibility of any *other* device
  // trying to use an index <= `I` while anchoring to a *newer* block than `B_N` because if we were anchoring to
  // a newer block than `B_N` then we would already have seen the log with index `I` and hence the device would have
  // chosen a larger index.
  //    If that *other* device would anchor to a block older than `B_N` then that tx could never be included in a block
  // because it would already have been expired.
  //
  // Therefore, once we see that index `I` has been used in a block that is at least `MAX_TX_LIFETIME`
  // seconds old, we can safely stop syncing logs for all indexes <= `I` and set highestAgedIndex = `I`.
  //
  // ## Explanation of the upper bound `highestFinalizedIndex + WINDOW_LEN`
  //
  // When a sender chooses a tagging index, they will select an index that is at most `WINDOW_LEN` greater than
  // the highest finalized index. If that index was already used, they will throw an error. For this reason we
  // don't have to look further than `highestFinalizedIndex + WINDOW_LEN`.

  let finalizedBlockNumber: number, currentTimestamp: bigint;
  {
    const [l2Tips, latestBlockHeader] = await Promise.all([aztecNode.getL2Tips(), aztecNode.getBlockHeader('latest')]);

    if (!latestBlockHeader) {
      throw new Error('Node failed to return latest block header when syncing logs');
    }

    [finalizedBlockNumber, currentTimestamp] = [
      l2Tips.finalized.block.number,
      latestBlockHeader.globalVariables.timestamp,
    ];
  }

  let start: number, end: number;
  {
    const currentHighestAgedIndex = await taggingStore.getHighestAgedIndex(secret, jobId);
    const currentHighestFinalizedIndex = await taggingStore.getHighestFinalizedIndex(secret, jobId);

    // We don't want to include the highest aged index so we start from `currentHighestAgedIndex + 1` (or 0 if not set)
    start = currentHighestAgedIndex === undefined ? 0 : currentHighestAgedIndex + 1;

    // The highest index a sender can choose is "highest finalized index + window length" but given that
    // `loadLogsForRange` expects an exclusive `end` we add 1.
    end = (currentHighestFinalizedIndex ?? 0) + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;
  }

  const logs: TxScopedL2Log[] = [];

  while (true) {
    // Get private logs with their block timestamps and corresponding tagging indexes
    const privateLogsWithIndexes = await loadLogsForRange(
      secret,
      app,
      aztecNode,
      start,
      end,
      anchorBlockNumber,
      anchorBlockHash,
    );

    if (privateLogsWithIndexes.length === 0) {
      break;
    }

    logs.push(...privateLogsWithIndexes.map(({ log }) => log));

    const { highestAgedIndex, highestFinalizedIndex } = findHighestIndexes(
      privateLogsWithIndexes,
      currentTimestamp,
      finalizedBlockNumber,
    );

    // Store updates in data provider and update local variables
    if (highestAgedIndex !== undefined) {
      await taggingStore.updateHighestAgedIndex(secret, highestAgedIndex, jobId);
    }

    if (highestFinalizedIndex === undefined) {
      // We have not found a new highest finalized index, so there is no need to move the window forward.
      break;
    }

    if (highestAgedIndex !== undefined && highestAgedIndex > highestFinalizedIndex) {
      // This is just a sanity check as this should never happen.
      throw new Error('Highest aged index lower than highest finalized index invariant violated');
    }

    await taggingStore.updateHighestFinalizedIndex(secret, highestFinalizedIndex, jobId);

    // For the next iteration we want to look only at indexes for which we have not attempted to load logs yet while
    // ensuring that we do not look further than WINDOW_LEN ahead of the highest finalized index.
    start = end;
    end = highestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1; // `end` is exclusive so we add 1.
  }

  return logs;
}
