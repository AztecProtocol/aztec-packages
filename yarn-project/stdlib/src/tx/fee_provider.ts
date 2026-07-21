import type { ManaUsageEstimate } from '../gas/fee_math.js';
import type { GasFees } from '../gas/gas_fees.js';

/** Provides current and predicted fee information for transaction pricing. */
export interface FeeProvider {
  /** Returns the current minimum fees for inclusion in the next block. */
  getCurrentMinFees(): Promise<GasFees>;
  /** Returns current min fees first, followed by predicted min fees for each slot in the prediction window. */
  getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]>;
}
