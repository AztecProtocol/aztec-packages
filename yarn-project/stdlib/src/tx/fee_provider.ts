import type { ManaUsageEstimate } from '../gas/fee_math.js';
import type { GasFees } from '../gas/gas_fees.js';

/**
 * L1 view a caller wants its fees priced against. A caller that planned from an archiver snapshot passes that
 * snapshot's L1 sync point, so its plan and the fees describe the same L1 block.
 */
export type FeeAsOf = {
  /** L1 block number the fees should describe; the provider answers with its closest view when it cannot. */
  blockNumber: bigint;
  /** Upper bound on how long to wait for a refresh when the provider has not reached that block yet. */
  maxWaitMs?: number;
};

/** Provides current and predicted fee information for transaction pricing. */
export interface FeeProvider {
  /**
   * Returns the current minimum fees for inclusion in the next block.
   * @param asOf - L1 block to price at; defaults to the provider's newest view.
   */
  getCurrentMinFees(asOf?: FeeAsOf): Promise<GasFees>;
  /**
   * Returns current min fees first, followed by predicted min fees for each slot in the prediction window.
   * @param asOf - L1 block to price at; defaults to the provider's newest view.
   */
  getPredictedMinFees(manaUsage?: ManaUsageEstimate, asOf?: FeeAsOf): Promise<GasFees[]>;
}
