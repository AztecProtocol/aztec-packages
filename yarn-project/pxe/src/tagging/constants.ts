import { MAX_PRIVATE_LOGS_PER_TX } from '@aztec/constants';

// This window has to cover the largest expected number of unfinalized logs emitted for a given directional app tagging
// secret. If more tag indexes are consumed than this window, an error is thrown in `PXE::proveTx`.
//
// Having a large window significantly slowed down `e2e_l1_with_wall_time` test as there we perform sync for more than
// 1000 secrets, so keep this bounded to the per-tx private log limit.
export const UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN = MAX_PRIVATE_LOGS_PER_TX;

/**
 * Exclusive upper bound of the tag indexes that can exist for a secret whose highest finalized index is
 * `finalizedIndex` (undefined when nothing is finalized yet). The sender store refuses pending indexes at or past it,
 * and both sender and recipient sync scan exactly up to it. Every absolute window bound must come from this helper:
 * a site with a wider or narrower bound lets a tx land at an index the syncs never scan, so two stores sharing the
 * secret could later pick a colliding index.
 */
export function unfinalizedTaggingIndexesWindowEnd(finalizedIndex: number | undefined): number {
  const windowStart = finalizedIndex === undefined ? 0 : finalizedIndex + 1;
  return windowStart + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
}
