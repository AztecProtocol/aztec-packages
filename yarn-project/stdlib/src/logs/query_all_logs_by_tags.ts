import { MAX_LOGS_PER_TAG } from '../interfaces/api_limit.js';
import { LogCursor } from './log_cursor.js';
import type { LogResult } from './log_result.js';
import type { PrivateLogsQuery, PublicLogsQuery, TagQuery } from './logs_query.js';
import type { SiloedTag } from './siloed_tag.js';
import type { Tag } from './tag.js';

/** Minimal node surface needed by {@link queryAllPrivateLogsByTags}. */
export type PrivateLogsByTagsFetcher = {
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]>;
};

/** Minimal node surface needed by {@link queryAllPublicLogsByTags}. */
export type PublicLogsByTagsFetcher = {
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]>;
};

/**
 * Drives the per-tag `afterLog` cursor loop for {@link PrivateLogsByTagsFetcher.getPrivateLogsByTags}.
 *
 * Each round re-queries only the tags whose previous page was full (`length === effective limit`), passing
 * the cursor of the last seen log. Tags drop out as soon as they return a short page. Results are stitched
 * back into one inner array per input tag, preserving the original input order.
 *
 * Honors {@link PrivateLogsQuery.limitPerTag} when set (caller is responsible for keeping it `<=`
 * {@link MAX_LOGS_PER_TAG}; the query schema enforces this on the RPC boundary).
 */
export function queryAllPrivateLogsByTags(
  node: PrivateLogsByTagsFetcher,
  query: PrivateLogsQuery,
): Promise<LogResult[][]> {
  return queryAllByTags(
    query.tags,
    tagQueries => node.getPrivateLogsByTags({ ...query, tags: tagQueries }),
    query.limitPerTag,
  );
}

/** {@inheritDoc queryAllPrivateLogsByTags} */
export function queryAllPublicLogsByTags(
  node: PublicLogsByTagsFetcher,
  query: PublicLogsQuery,
): Promise<LogResult[][]> {
  return queryAllByTags(
    query.tags,
    tagQueries => node.getPublicLogsByTags({ ...query, tags: tagQueries }),
    query.limitPerTag,
  );
}

/**
 * Generic per-tag pagination loop, abstracted over the query shape (private vs public). Caller supplies
 * a `fetchPage` that runs one round against the node with the still-active subset of tag queries.
 *
 * @param tags - Input tag queries in original order. Returned outer array has the same length and order.
 * @param fetchPage - Per-round fetch hook; receives the active subset and returns one page per active tag.
 * @param limitPerTag - Effective page cap used to detect "full page" → keep paginating; defaults to
 *   {@link MAX_LOGS_PER_TAG} (the server-side cap when the query doesn't override).
 */
async function queryAllByTags<T extends Tag | SiloedTag>(
  tags: TagQuery<T>[],
  fetchPage: (tagQueries: TagQuery<T>[]) => Promise<LogResult[][]>,
  limitPerTag: number | undefined,
): Promise<LogResult[][]> {
  const effectiveLimit = limitPerTag ?? MAX_LOGS_PER_TAG;
  const allResultsPerTag: LogResult[][] = tags.map(() => []);
  let activeIndexes = tags.map((_, i) => i);
  let nextQueries: TagQuery<T>[] = tags.slice();

  while (activeIndexes.length > 0) {
    const pageResults = await fetchPage(nextQueries);

    const stillActive: number[] = [];
    const followups: TagQuery<T>[] = [];
    for (let i = 0; i < activeIndexes.length; i++) {
      const originalIdx = activeIndexes[i];
      const pageForTag = pageResults[i];
      allResultsPerTag[originalIdx].push(...pageForTag);
      if (pageForTag.length === effectiveLimit) {
        const lastLog = pageForTag[pageForTag.length - 1];
        stillActive.push(originalIdx);
        followups.push({ tag: tagOf(tags[originalIdx]), afterLog: LogCursor.fromLog(lastLog) });
      }
    }
    activeIndexes = stillActive;
    nextQueries = followups;
  }

  return allResultsPerTag;
}

/** Unwraps a `TagQuery` to its underlying `Tag` / `SiloedTag` regardless of the bare-vs-object form. */
function tagOf<T extends Tag | SiloedTag>(entry: TagQuery<T>): T {
  if (typeof entry === 'object' && entry !== null && 'tag' in entry) {
    return entry.tag;
  }
  return entry as T;
}
