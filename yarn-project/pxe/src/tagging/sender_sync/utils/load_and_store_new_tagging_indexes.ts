import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { type AppTaggingSecret, SiloedTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { SenderTaggingStore } from '../../../storage/tagging_store/sender_tagging_store.js';
import { getAllPrivateLogsByTags } from '../../get_all_logs_by_tags.js';

/**
 * Loads tagging indexes from the Aztec node and stores them in the tagging data provider.
 * @remarks This function is one of two places by which a pending index can get to the tagging data provider. The other
 * place is when a tx is being sent from this PXE.
 * @param extendedSecret - The app tagging secret whose indexes are being synced.
 * @param start - The starting index (inclusive) of the window to process.
 * @param end - The ending index (exclusive) of the window to process.
 * @param aztecNode - The Aztec node instance to query for logs.
 * @param taggingStore - The data provider to store pending indexes.
 * @param anchorBlockHash - Hash of a block to use as reference block when querying node.
 * @param jobId - Job identifier, used to keep writes in-memory until they can be persisted in a data integrity
 * preserving way.
 */
export async function loadAndStoreNewTaggingIndexes(
  extendedSecret: AppTaggingSecret,
  start: number,
  end: number,
  aztecNode: AztecNode,
  taggingStore: SenderTaggingStore,
  anchorBlockHash: BlockHash,
  jobId: string,
) {
  // We compute the tags for the current window of indexes
  const siloedTagsForWindow = await Promise.all(
    Array.from({ length: end - start }, (_, i) => SiloedTag.compute({ extendedSecret, index: start + i })),
  );

  const txsForTags = await getTxsContainingTags(siloedTagsForWindow, aztecNode, anchorBlockHash);
  const txIndexesMap = getTxIndexesMap(txsForTags, start, siloedTagsForWindow.length);

  // Now we iterate over the map, construct the tagging index ranges and store them in the db. A tx already tracked
  // in the store is merged rather than range-checked: if this PXE sent the tx and it partially reverted, the chain
  // only shows the surviving sub-range of the prove-time entry (the finalized receipt step of the sync owns
  // resolving that difference), and a tx from another PXE may straddle a sync window boundary, in which case the
  // entry is widened so the next index choice covers the full onchain range.
  for (const [txHashStr, indexes] of txIndexesMap.entries()) {
    const txHash = TxHash.fromString(txHashStr);
    const ranges = [{ extendedSecret, lowestIndex: Math.min(...indexes), highestIndex: Math.max(...indexes) }];
    await taggingStore.mergePendingIndexes(ranges, txHash, jobId);
  }
}

// Returns txs that used the given tags. A tag might have been used in multiple txs and for this reason we return
// an array for each tag.
async function getTxsContainingTags(
  tags: SiloedTag[],
  aztecNode: AztecNode,
  anchorBlockHash: BlockHash,
): Promise<TxHash[][]> {
  // We use the utility function below to retrieve all logs for the tags across all pages, so we don't need to handle
  // pagination here. Sender sync only needs `txHash` from each log, so we leave `includeEffects` off.
  const allLogs = await getAllPrivateLogsByTags(aztecNode, tags, anchorBlockHash);
  return allLogs.map(logs => logs.map(log => log.txHash));
}

// Returns a map of txHash to all indexes for that txHash.
function getTxIndexesMap(txHashesForTags: TxHash[][], start: number, count: number): Map<string, number[]> {
  if (txHashesForTags.length !== count) {
    throw new Error(`Number of tx hashes arrays does not match number of tags. ${txHashesForTags.length} !== ${count}`);
  }

  const indexesMap = new Map<string, number[]>();
  // Iterate over indexes
  for (let i = 0; i < txHashesForTags.length; i++) {
    const taggingIndex = start + i;
    const txHashesForTag = txHashesForTags[i];
    // iterate over tx hashes that used that index (tag)
    for (const txHash of txHashesForTag) {
      const key = txHash.toString();
      const existing = indexesMap.get(key);
      // Add the index to the tx's indexes
      if (existing) {
        existing.push(taggingIndex);
      } else {
        indexesMap.set(key, [taggingIndex]);
      }
    }
  }
  return indexesMap;
}
