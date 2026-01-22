import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
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
 * Fetches all private logs for the given tags, automatically paginating through all pages.
 * @param aztecNode - The Aztec node to query.
 * @param tags - The siloed tags to search for.
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPrivateLogsByTags(aztecNode: AztecNode, tags: SiloedTag[]): Promise<TxScopedL2Log[][]> {
  return getAllPages(tags.length, page => aztecNode.getPrivateLogsByTags(tags, page));
}

/**
 * Fetches all public logs for the given tags from a contract, automatically paginating through all pages.
 * @param aztecNode - The Aztec node to query.
 * @param contractAddress - The contract address to search logs for.
 * @param tags - The tags to search for.
 * @returns An array of log arrays, one per tag, containing all logs across all pages.
 */
export function getAllPublicLogsByTagsFromContract(
  aztecNode: AztecNode,
  contractAddress: AztecAddress,
  tags: Tag[],
): Promise<TxScopedL2Log[][]> {
  return getAllPages(tags.length, page => aztecNode.getPublicLogsByTagsFromContract(contractAddress, tags, page));
}
