import { P75AllTxsPriorityFeeStrategy } from './p75_competitive.js';
import { P75BlobTxsOnlyPriorityFeeStrategy } from './p75_competitive_blob_txs_only.js';
import type { PriorityFeeStrategy } from './types.js';

export {
  HISTORICAL_BLOCK_COUNT,
  type PriorityFeeStrategy,
  type PriorityFeeStrategyContext,
  type PriorityFeeStrategyResult,
} from './types.js';

export { P75AllTxsPriorityFeeStrategy } from './p75_competitive.js';
export { P75BlobTxsOnlyPriorityFeeStrategy } from './p75_competitive_blob_txs_only.js';

/**
 * Default list of priority fee strategies to analyze.
 * Add more strategies here for comparison.
 */
export const DEFAULT_PRIORITY_FEE_STRATEGIES: PriorityFeeStrategy[] = [
  P75AllTxsPriorityFeeStrategy,
  P75BlobTxsOnlyPriorityFeeStrategy,
];
