import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';

/**
 * Generic pagination helper that fetches all pages of results.
 * @param numTags - The number of tags being queried (determines result array size).
 * @param fetchPage - Function that fetches a single page of results given a page number.
 * @returns An array of arrays, one per tag, containing all results across all pages.
 */
async function getAllPages<T>(numTags: number, fetchPage: (page: number) => Promise<T[][]>): Promise<T[][]> {
  const allResultsPerTag: T[][] = Array.from({ length: numTags }, () => []);
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const resultsPage = await fetchPage(page);
    hasMore = false;

    for (let i = 0; i < resultsPage.length; i++) {
      allResultsPerTag[i].push(...resultsPage[i]);
      if (resultsPage[i].length === MAX_LOGS_PER_TAG) {
        hasMore = true;
      }
    }
    page++;
  }

  return allResultsPerTag;
}

/**
 * Splits tags into chunks of MAX_RPC_LEN, fetches logs for each chunk using getAllPages, then stitches the results
 * back into a single array preserving the original tag order.
 */
async function getAllPagesInBatches<Tag, T>(
  tags: Tag[],
  fetchAllPagesForBatch: (batch: Tag[]) => Promise<T[][]>,
): Promise<T[][]> {
  if (tags.length <= MAX_RPC_LEN) {
    return fetchAllPagesForBatch(tags);
  }

  const batches: Tag[][] = [];
  for (let i = 0; i < tags.length; i += MAX_RPC_LEN) {
    batches.push(tags.slice(i, i + MAX_RPC_LEN));
  }
  const batchResults = await Promise.all(batches.map(fetchAllPagesForBatch));
  return batchResults.flat();
}

/**
 * Fetches all private logs for the given tags, automatically paginating through all pages.
 * @param aztecNode - The Aztec node to query.
 * @param tags - The siloed tags to search for.
 * @param anchorBlockHash - reference block for the Aztec node query, throws if block is not found there (typically
 * because of reorgs).
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPrivateLogsByTags(
  aztecNode: AztecNode,
  tags: SiloedTag[],
  anchorBlockHash: BlockHash,
): Promise<TxScopedL2Log[][]> {
  return getAllPagesInBatches(tags, batch =>
    getAllPages(batch.length, page => aztecNode.getPrivateLogsByTags(batch, page, anchorBlockHash)),
  );
}

/**
 * Fetches all public logs for the given tags from a contract, automatically paginating through all pages.
 * @param aztecNode - The Aztec node to query.
 * @param contractAddress - The contract address to search logs for.
 * @param tags - The tags to search for.
 * @param anchorBlockHash - reference block for the Aztec node query, throws if block is not found there (typically
 * because of reorgs).
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPublicLogsByTagsFromContract(
  aztecNode: AztecNode,
  contractAddress: AztecAddress,
  tags: Tag[],
  anchorBlockHash: BlockHash,
): Promise<TxScopedL2Log[][]> {
  return getAllPagesInBatches(tags, batch =>
    getAllPages(batch.length, page =>
      aztecNode.getPublicLogsByTagsFromContract(contractAddress, batch, page, anchorBlockHash),
    ),
  );
}
