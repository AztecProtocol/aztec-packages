import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { type AppTaggingSecret, type LogResult, SiloedTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { SenderTaggingStore } from '../../../storage/tagging_store/sender_tagging_store.js';
import { type LogQueryAnchor, getAllPrivateLogsByTags } from '../../get_all_logs_by_tags.js';

/**
 * Loads tagging indexes from the Aztec node and stores them in the tagging data provider. Returns the txs the
 * window's logs carried, keyed by tx hash string, with the block each was mined in and the window indexes it used,
 * so the caller can classify their finalization status without further node queries.
 * @remarks This function is one of two places by which a pending index can get to the tagging data provider. The other
 * place is when a tx is being sent from this PXE.
 * @param extendedSecret - The app tagging secret whose indexes are being synced.
 * @param start - The starting index (inclusive) of the window to process.
 * @param end - The ending index (exclusive) of the window to process.
 * @param aztecNode - The Aztec node instance to query for logs.
 * @param taggingStore - The data provider to store pending indexes.
 * @param anchor - Block the log query is anchored to.
 * @param jobId - Job identifier, used to keep writes in-memory until they can be persisted in a data integrity
 * preserving way.
 */
export async function loadAndStoreNewTaggingIndexes(
  extendedSecret: AppTaggingSecret,
  start: number,
  end: number,
  aztecNode: AztecNode,
  taggingStore: SenderTaggingStore,
  anchor: LogQueryAnchor,
  jobId: string,
): Promise<Map<string, TxInLogs>> {
  // We compute the tags for the current window of indexes
  const siloedTagsForWindow = await Promise.all(
    Array.from({ length: end - start }, (_, i) => SiloedTag.compute({ extendedSecret, index: start + i })),
  );

  const allLogs = await getAllPrivateLogsByTags(aztecNode, siloedTagsForWindow, anchor);
  if (allLogs.length !== siloedTagsForWindow.length) {
    throw new Error(
      `Number of log arrays does not match number of tags. ${allLogs.length} !== ${siloedTagsForWindow.length}`,
    );
  }

  const txsInLogs = getTxsInLogs(allLogs, start);

  // Now we iterate over the map, construct the tagging index ranges and store them in the db. A tx already tracked
  // in the store is merged rather than range-checked: if this PXE sent the tx and it partially reverted, the chain
  // only shows the surviving sub-range of the prove-time entry (the finalized receipt step of the sync owns
  // resolving that difference), and a tx from another PXE may straddle a sync window boundary, in which case the
  // entry is widened so the next index choice covers the full onchain range.
  for (const [txHashStr, { taggingIndexes }] of txsInLogs.entries()) {
    const txHash = TxHash.fromString(txHashStr);
    const ranges = [
      { extendedSecret, lowestIndex: Math.min(...taggingIndexes), highestIndex: Math.max(...taggingIndexes) },
    ];
    await taggingStore.mergePendingIndexes(ranges, txHash, jobId);
  }

  return txsInLogs;
}

/** A tx that a sync window's logs carried. */
export type TxInLogs = {
  /** The block the tx was mined in, which decides whether it is finalized. */
  blockNumber: BlockNumber;
  /** The window's tagging indexes whose siloed tags this tx's logs carried. */
  taggingIndexes: number[];
};

// Returns a map of txHash to the block it was mined in and all window indexes used by it.
function getTxsInLogs(logsForTags: LogResult[][], start: number): Map<string, TxInLogs> {
  const txsInLogs = new Map<string, TxInLogs>();
  // Iterate over indexes
  for (let i = 0; i < logsForTags.length; i++) {
    const taggingIndex = start + i;
    // iterate over logs that used that index (tag)
    for (const log of logsForTags[i]) {
      const key = log.txHash.toString();
      const existing = txsInLogs.get(key);
      // Add the index to the tx's indexes
      if (existing) {
        existing.taggingIndexes.push(taggingIndex);
      } else {
        txsInLogs.set(key, { blockNumber: log.blockNumber, taggingIndexes: [taggingIndex] });
      }
    }
  }
  return txsInLogs;
}
