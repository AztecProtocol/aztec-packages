import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { DirectionalAppTaggingSecret, PreTag, TxScopedL2Log } from '@aztec/stdlib/logs';

import { SiloedTag } from '../../siloed_tag.js';
import { Tag } from '../../tag.js';

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
): Promise<Array<{ log: TxScopedL2Log; taggingIndex: number }>> {
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

  return privateLogsWithIndexes;
}
