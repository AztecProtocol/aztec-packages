import type { SlotNumber } from '@aztec/foundation/branded-types';

import type { ManaUsageEstimate } from '../gas/fee_math.js';
import type { GasFees } from '../gas/gas_fees.js';

/**
 * Snapshot describing the timestamp, slot, and gas fees for the next L2 block at the current
 * instant. Callers that need every field (e.g. `simulatePublicCalls`) consume the whole triple;
 * callers that only care about fees use {@link FeeProvider.getCurrentMinFees}.
 */
export interface CurrentMinFeesSnapshot {
  /** Target timestamp used to query `getManaMinFeeAt`. */
  timestamp: bigint;
  /** L2 slot at {@link timestamp}. */
  slotNumber: SlotNumber;
  /** Gas fees for the next block built at {@link timestamp}. */
  gasFees: GasFees;
}

/** Provides current and predicted fee information for transaction pricing. */
export interface FeeProvider {
  /** Returns the current minimum fees for inclusion in the next block. */
  getCurrentMinFees(): Promise<GasFees>;
  /** Returns the full {timestamp, slotNumber, gasFees} snapshot for the next L2 block at the current instant. */
  getCurrentMinFeesSnapshot(): Promise<CurrentMinFeesSnapshot>;
  /** Returns predicted min fees for each slot in the prediction window. */
  getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]>;
}
