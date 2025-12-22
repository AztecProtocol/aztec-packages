import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { DirectionalAppTaggingSecret, PreTag, TxScopedL2Log } from '@aztec/stdlib/logs';

import { SiloedTag } from '../../siloed_tag.js';
import { Tag } from '../../tag.js';

/**
 * Gets private logs with their corresponding block timestamps and tagging indexes for the given index range, `app` and
 * `secret`. At most load logs from blocks up to and including `anchorBlockNumber`. `start` is inclusive and `end` is
 * exclusive.
 *
 * TODO: Optimize Aztec Node API such that this function performs only a single call.
 */
export async function loadLogsForRange(
  secret: DirectionalAppTaggingSecret,
  app: AztecAddress,
  aztecNode: AztecNode,
  start: number,
  end: number,
  anchorBlockNumber: BlockNumber,
): Promise<Array<{ log: TxScopedL2Log; blockTimestamp: bigint; taggingIndex: number }>> {
  // Derive tags for the window
  const preTags: PreTag[] = Array(end - start)
    .fill(0)
    .map((_, i) => ({ secret, index: start + i }));
  const siloedTags = await Promise.all(preTags.map(preTag => Tag.compute(preTag))).then(tags =>
    Promise.all(tags.map(tag => SiloedTag.compute(tag, app))),
  );

  // Get logs for these tags
  const tagsAsFr = siloedTags.map(tag => tag.value);
  const allLogs = await aztecNode.getLogsByTags(tagsAsFr);

  // Collect all private logs with their corresponding tagging indexes
  const privateLogsWithIndexes: Array<{ log: TxScopedL2Log; taggingIndex: number }> = [];
  for (let i = 0; i < allLogs.length; i++) {
    const logs = allLogs[i];
    const taggingIndex = preTags[i].index;
    for (const log of logs) {
      if (!log.isFromPublic && log.blockNumber <= anchorBlockNumber) {
        privateLogsWithIndexes.push({ log, taggingIndex });
      }
    }
  }

  // If no private logs were obtained, return an empty array
  if (privateLogsWithIndexes.length === 0) {
    return [];
  }

  // Get unique block hashes
  const uniqueBlockHashes = Array.from(new Set(privateLogsWithIndexes.map(({ log }) => log.blockHash.toBigInt()))).map(
    hash => new Fr(hash),
  );

  // Get block headers for all unique block hashes
  const blockHeaders = await Promise.all(uniqueBlockHashes.map(blockHash => aztecNode.getBlockHeaderByHash(blockHash)));

  // Return logs with their corresponding block timestamps and tagging indexes
  const result: Array<{ log: TxScopedL2Log; blockTimestamp: bigint; taggingIndex: number }> = [];
  for (const { log, taggingIndex } of privateLogsWithIndexes) {
    // TODO: Unify types of blockHash on log and on block header so we don't need to do this ugly conversion.
    const logBlockHash = log.blockHash.toBigInt();
    const logBlockHeader = blockHeaders[uniqueBlockHashes.findIndex(hash => hash.toBigInt() === logBlockHash)];
    if (!logBlockHeader) {
      // If the block header for a log cannot be found, it indicates a reorg occurred between `getLogsByTags` and
      // `getBlockHeaderByHash`. It is correct and safe to ignore such logs because they have been pruned from
      // the chain. PXE block synchronizer will reset any state following the reorg block.
      continue;
    }

    result.push({ log, blockTimestamp: logBlockHeader.globalVariables.timestamp, taggingIndex });
  }

  return result;
}
