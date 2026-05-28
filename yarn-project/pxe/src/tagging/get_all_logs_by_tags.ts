import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { LogCursor, type LogResult, type SiloedTag, type Tag, type TagQuery } from '@aztec/stdlib/logs';

/** Optional block-range and effects opt-in shared by both wrappers. */
export type GetAllLogsByTagsOptions = {
  /** Lower block bound, inclusive. */
  fromBlock?: BlockNumber;
  /** Upper block bound, exclusive. */
  toBlock?: BlockNumber;
  /**
   * When set, each log also carries `noteHashes` and all `nullifiers` of its tx. Defaults to off — sender
   * sync only needs `txHash`. The recipient-sync/log-service paths flip this on to build `PendingTaggedLog`
   * / `LogRetrievalResponse` from note data.
   */
  includeEffects?: boolean;
};

/**
 * Fetches all logs for the given tags by paginating per-tag via `afterLog` cursors.
 *
 * Each round, only tags that returned a full page on the previous round are re-queried — using the
 * cursor of their last seen log as `afterLog`. A tag drops out of the request set as soon as it returns
 * a short page (less than `MAX_LOGS_PER_TAG`). Results are stitched back into one array per input tag,
 * preserving input order.
 *
 * @param tags - Input tags in original order. The returned outer array has the same length and order.
 * @param fetchPage - Per-round fetch hook. Receives the subset of tags still active for this round and
 *   their per-tag `afterLog` cursor (undefined on the first round). Returns one inner array per active tag.
 */
async function getAllPages<T extends Tag | SiloedTag>(
  tags: T[],
  fetchPage: (tagQueries: TagQuery<T>[]) => Promise<LogResult[][]>,
): Promise<LogResult[][]> {
  const allResultsPerTag: LogResult[][] = tags.map(() => []);
  let activeIndexes = tags.map((_, i) => i);
  let nextQueries: TagQuery<T>[] = tags.map(tag => tag);

  while (activeIndexes.length > 0) {
    const pageResults = await fetchPage(nextQueries);

    const stillActive: number[] = [];
    const followups: TagQuery<T>[] = [];
    for (let i = 0; i < activeIndexes.length; i++) {
      const originalIdx = activeIndexes[i];
      const pageForTag = pageResults[i];
      allResultsPerTag[originalIdx].push(...pageForTag);
      if (pageForTag.length === MAX_LOGS_PER_TAG) {
        const lastLog = pageForTag[pageForTag.length - 1];
        stillActive.push(originalIdx);
        followups.push({ tag: tags[originalIdx], afterLog: LogCursor.fromLog(lastLog) });
      }
    }
    activeIndexes = stillActive;
    nextQueries = followups;
  }

  return allResultsPerTag;
}

/**
 * Splits tags into chunks of MAX_RPC_LEN, fetches logs for each chunk using getAllPages, then stitches the results
 * back into a single array preserving the original tag order.
 */
async function getAllPagesInBatches<T extends Tag | SiloedTag>(
  tags: T[],
  fetchAllPagesForBatch: (batch: T[]) => Promise<LogResult[][]>,
): Promise<LogResult[][]> {
  if (tags.length === 0) {
    return [];
  }

  if (tags.length <= MAX_RPC_LEN) {
    return fetchAllPagesForBatch(tags);
  }

  const batches: T[][] = [];
  for (let i = 0; i < tags.length; i += MAX_RPC_LEN) {
    batches.push(tags.slice(i, i + MAX_RPC_LEN));
  }
  const batchResults = await Promise.all(batches.map(fetchAllPagesForBatch));
  return batchResults.flat();
}

/**
 * Fetches all private logs for the given tags, automatically paginating per-tag via `afterLog` cursors.
 *
 * @param aztecNode - The Aztec node to query.
 * @param tags - The siloed tags to search for.
 * @param anchorBlockHash - Reference block for the Aztec node query, throws if block is not found there (typically
 *   because of reorgs).
 * @param options - Optional `fromBlock`/`toBlock` range and `includeEffects` opt-in.
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPrivateLogsByTags(
  aztecNode: AztecNode,
  tags: SiloedTag[],
  anchorBlockHash: BlockHash,
  options: GetAllLogsByTagsOptions = {},
): Promise<LogResult[][]> {
  return getAllPagesInBatches(tags, batch =>
    getAllPages(batch, tagQueries =>
      aztecNode.getPrivateLogsByTags({
        tags: tagQueries,
        referenceBlock: anchorBlockHash,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        includeEffects: options.includeEffects ?? false,
      }),
    ),
  );
}

/**
 * Fetches all public logs for the given tags from a contract, automatically paginating per-tag via `afterLog` cursors.
 *
 * @param aztecNode - The Aztec node to query.
 * @param contractAddress - The contract address to search logs for.
 * @param tags - The tags to search for.
 * @param anchorBlockHash - Reference block for the Aztec node query, throws if block is not found there (typically
 *   because of reorgs).
 * @param options - Optional `fromBlock`/`toBlock` range and `includeEffects` opt-in.
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPublicLogsByTagsFromContract(
  aztecNode: AztecNode,
  contractAddress: AztecAddress,
  tags: Tag[],
  anchorBlockHash: BlockHash,
  options: GetAllLogsByTagsOptions = {},
): Promise<LogResult[][]> {
  return getAllPagesInBatches(tags, batch =>
    getAllPages(batch, tagQueries =>
      aztecNode.getPublicLogsByTags({
        contractAddress,
        tags: tagQueries,
        referenceBlock: anchorBlockHash,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        includeEffects: options.includeEffects ?? false,
      }),
    ),
  );
}
