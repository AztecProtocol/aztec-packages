import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { DirectionalAppTaggingSecret, PreTag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';

import { getAllPrivateLogsByTags } from '../../get_all_logs_by_tags.js';

/**
 * Gets private logs with their corresponding block timestamps and tagging indexes for the given index range, `app` and
 * `secret`. At most load logs from blocks up to and including `anchorBlockNumber`. `start` is inclusive and `end` is
 * exclusive.
 */
export async function loadLogsForRange(
  secret: DirectionalAppTaggingSecret,
  app: AztecAddress,
  aztecNode: AztecNode,
  start: number,
  end: number,
  anchorBlockNumber: BlockNumber,
  anchorBlockHash: BlockHash,
): Promise<Array<{ log: TxScopedL2Log; taggingIndex: number }>> {
  // Derive tags for the window
  const preTags: PreTag[] = Array(end - start)
    .fill(0)
    .map((_, i) => ({ secret, index: start + i }));
  const siloedTags = await Promise.all(preTags.map(preTag => Tag.compute(preTag))).then(tags =>
    Promise.all(tags.map(tag => SiloedTag.compute(tag, app))),
  );

  // We use the utility function below to retrieve all logs for the tags across all pages, so we don't need to handle
  // pagination here.
  const logs = await getAllPrivateLogsByTags(aztecNode, siloedTags, anchorBlockHash);

  // Pair logs with their corresponding tagging indexes
  const logsWithIndexes: Array<{ log: TxScopedL2Log; taggingIndex: number }> = [];
  for (let i = 0; i < logs.length; i++) {
    const logsForTag = logs[i];
    const taggingIndex = preTags[i].index;
    for (const log of logsForTag) {
      if (log.blockNumber <= anchorBlockNumber) {
        logsWithIndexes.push({ log, taggingIndex });
      }
    }
  }

  return logsWithIndexes;
}
