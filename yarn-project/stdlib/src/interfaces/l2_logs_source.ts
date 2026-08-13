import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { BlockHash } from '../block/block_hash.js';
import type { LogResult } from '../logs/log_result.js';
import type { LogsQueryBase, PrivateLogsQuery, PublicLogsQuery } from '../logs/logs_query.js';

/**
 * A logs query whose reorg-safety anchor has been resolved to a concrete block hash. The wire form accepts every
 * {@link BlockParameter} a client may send, and the node RPC layer resolves the ones that do not carry a hash — a
 * number, a tag, an archive root — against the chain before the query reaches a logs source.
 */
export type ResolvedLogsQuery<T extends LogsQueryBase> = Omit<T, 'referenceBlock'> & { referenceBlock?: BlockHash };

/**
 * Interface of classes allowing for the retrieval of logs.
 *
 * The return type is always the widest {@link LogResult} shape (noteHashes/nullifiers optional). To
 * narrow at the call site after passing `includeEffects: true`, use the typed wrapper functions in
 * `pxe/src/tagging/get_all_logs_by_tags.ts` (or cast — the wire payload is the widest shape, so a
 * stricter generic on this interface would not survive the JSON-RPC boundary anyway).
 */
export interface L2LogsSource {
  /**
   * Gets private logs matching the given tags. Returns one inner array per element of `query.tags`, in
   * input order. An empty inner array means no logs matched that tag.
   */
  getPrivateLogsByTags(query: ResolvedLogsQuery<PrivateLogsQuery>): Promise<LogResult[][]>;

  /**
   * Gets public logs matching the given tags for the given contract. Returns one inner array per element
   * of `query.tags`, in input order. An empty inner array means no logs matched that tag.
   */
  getPublicLogsByTags(query: ResolvedLogsQuery<PublicLogsQuery>): Promise<LogResult[][]>;

  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;
}
