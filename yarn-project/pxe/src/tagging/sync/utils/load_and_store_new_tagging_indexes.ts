import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { SenderTaggingDataProvider } from '../../../storage/tagging_data_provider/sender_tagging_data_provider.js';
import { SiloedTag } from '../../siloed_tag.js';
import { Tag } from '../../tag.js';

/**
 * Loads tagging indexes from the Aztec node and stores them in the tagging data provider.
 * @remarks This function is one of two places by which a pending index can get to the tagging data provider. The other
 * place is when a tx is being sent from this PXE.
 * @param secret - The directional app tagging secret that's unique for (sender, recipient, contract) tuple.
 * @param app - The address of the contract that the logs are tagged for. Used for siloing tags to match
 * kernel circuit behavior.
 * @param start - The starting index (inclusive) of the window to process.
 * @param end - The ending index (exclusive) of the window to process.
 * @param aztecNode - The Aztec node instance to query for logs.
 * @param taggingDataProvider - The data provider to store pending indexes.
 */
export async function loadAndStoreNewTaggingIndexes(
  secret: DirectionalAppTaggingSecret,
  app: AztecAddress,
  start: number,
  end: number,
  aztecNode: AztecNode,
  taggingDataProvider: SenderTaggingDataProvider,
) {
  // We compute the tags for the current window of indexes
  const preTagsForWindow: PreTag[] = Array(end - start)
    .fill(0)
    .map((_, i) => ({ secret, index: start + i }));
  const siloedTagsForWindow = await Promise.all(
    preTagsForWindow.map(async preTag => SiloedTag.compute(await Tag.compute(preTag), app)),
  );

  const txsForTags = await getTxsContainingTags(siloedTagsForWindow, aztecNode);
  const highestIndexMap = getTxHighestIndexMap(txsForTags, preTagsForWindow);

  // Now we iterate over the map, reconstruct the preTags and tx hash and store them in the db.
  for (const [txHashStr, highestIndex] of highestIndexMap.entries()) {
    const txHash = TxHash.fromString(txHashStr);
    await taggingDataProvider.storePendingIndexes([{ secret, index: highestIndex }], txHash);
  }
}

// Returns txs that used the given tags. A tag might have been used in multiple txs and for this reason we return
// an array for each tag.
async function getTxsContainingTags(tags: SiloedTag[], aztecNode: AztecNode): Promise<TxHash[][]> {
  const tagsAsFr = tags.map(tag => tag.value);
  const allLogs = await aztecNode.getLogsByTags(tagsAsFr);
  return allLogs.map(logs => logs.filter(log => !log.isFromPublic).map(log => log.txHash));
}

// Returns a map of txHash to the highest index for that txHash.
function getTxHighestIndexMap(txHashesForTags: TxHash[][], preTagsForWindow: PreTag[]): Map<string, number> {
  if (txHashesForTags.length !== preTagsForWindow.length) {
    throw new Error(
      `Number of tx hashes arrays does not match number of pre-tags. ${txHashesForTags.length} !== ${preTagsForWindow.length}`,
    );
  }

  const highestIndexMap = new Map<string, number>();
  for (let i = 0; i < txHashesForTags.length; i++) {
    const taggingIndex = preTagsForWindow[i].index;
    const txHashesForTag = txHashesForTags[i];
    for (const txHash of txHashesForTag) {
      const key = txHash.toString();
      highestIndexMap.set(key, Math.max(highestIndexMap.get(key) ?? 0, taggingIndex));
    }
  }
  return highestIndexMap;
}
