import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import { MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import {
  type LogIncludeOptions,
  type LogResult,
  type SiloedTag,
  type Tag,
  queryAllPrivateLogsByTags,
  queryAllPublicLogsByTags,
} from '@aztec/stdlib/logs';

/** Optional block-range, effects opt-in, and pagination cap shared by both wrappers. */
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
  /**
   * Maximum number of logs returned per tag per round-trip. Capped at `MAX_LOGS_PER_TAG` on the node
   * (rejected if higher). Defaults to `MAX_LOGS_PER_TAG`. Mainly useful for tests that need to force
   * pagination at a small page size.
   */
  limitPerTag?: number;
};

/**
 * Splits tags into chunks of MAX_RPC_LEN, paginates each chunk via the stdlib per-tag cursor helper,
 * then stitches the results back into a single array preserving the original tag order.
 */
async function getAllPagesInBatches<T extends Tag | SiloedTag, Opts extends LogIncludeOptions>(
  tags: T[],
  fetchAllPagesForBatch: (batch: T[]) => Promise<LogResult<Opts>[][]>,
): Promise<LogResult<Opts>[][]> {
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
export function getAllPrivateLogsByTags<Opts extends GetAllLogsByTagsOptions = GetAllLogsByTagsOptions>(
  aztecNode: AztecNode,
  tags: SiloedTag[],
  anchorBlockHash: BlockHash,
  options: Opts = {} as Opts,
): Promise<LogResult<Opts>[][]> {
  return getAllPagesInBatches<SiloedTag, Opts>(
    tags,
    batch =>
      queryAllPrivateLogsByTags(aztecNode, {
        tags: batch,
        referenceBlock: anchorBlockHash,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        includeEffects: options.includeEffects ?? false,
        limitPerTag: options.limitPerTag,
      }) as Promise<LogResult<Opts>[][]>,
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
export function getAllPublicLogsByTagsFromContract<Opts extends GetAllLogsByTagsOptions = GetAllLogsByTagsOptions>(
  aztecNode: AztecNode,
  contractAddress: AztecAddress,
  tags: Tag[],
  anchorBlockHash: BlockHash,
  options: Opts = {} as Opts,
): Promise<LogResult<Opts>[][]> {
  return getAllPagesInBatches<Tag, Opts>(
    tags,
    batch =>
      queryAllPublicLogsByTags(aztecNode, {
        contractAddress,
        tags: batch,
        referenceBlock: anchorBlockHash,
        fromBlock: options.fromBlock,
        toBlock: options.toBlock,
        includeEffects: options.includeEffects ?? false,
        limitPerTag: options.limitPerTag,
      }) as Promise<LogResult<Opts>[][]>,
  );
}
