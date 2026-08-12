import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { LogResult } from '../logs/log_result.js';
import type { PrivateLogsQuery, PublicLogsQuery } from '../logs/logs_query.js';

/**
 * Interface of classes allowing for the retrieval of logs.
 *
 * The return type is always the widest {@link LogResult} shape (noteHashes/nullifiers optional). To
 * narrow at the call site after passing `includeEffects: true`, use the typed wrapper functions in
 * `pxe/src/tagging/get_all_logs_by_tags.ts` (or cast — the wire payload is the widest shape, so a
 * stricter generic on this interface would not survive the JSON-RPC boundary anyway).
 *
 * A tag query's `referenceBlock` is typed as the full `BlockParameter` its schema accepts at the node's RPC
 * boundary, but an implementation of this interface only has to serve the forms that carry a block hash: a bare
 * hash, `{ hash }`, and the anchored `{ number, hash }`. A number, a tag, or an archive root names a block the
 * implementation would have to resolve against the chain, which is the node's job and happens before a query
 * reaches here; implementations reject those forms instead.
 */
export interface L2LogsSource {
  /**
   * Gets private logs matching the given tags. Returns one inner array per element of `query.tags`, in
   * input order. An empty inner array means no logs matched that tag.
   *
   * `query.referenceBlock` must name a block hash (see the note on this interface).
   */
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]>;

  /**
   * Gets public logs matching the given tags for the given contract. Returns one inner array per element
   * of `query.tags`, in input order. An empty inner array means no logs matched that tag.
   *
   * `query.referenceBlock` must name a block hash (see the note on this interface).
   */
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]>;

  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;
}
