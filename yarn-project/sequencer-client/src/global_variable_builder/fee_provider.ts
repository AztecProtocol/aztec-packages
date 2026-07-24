import { type GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import type { FeeSnapshotService } from './fee_snapshot_service.js';

/**
 * Serves current and predicted fee information from the background {@link FeeSnapshotService}. Warm calls read
 * an in-memory snapshot and issue zero L1 requests; only an archiver identity change or a coverage miss triggers
 * a shared refresh. The service is owned by the node factory and shared with the p2p mempool policy.
 */
export class FeeProviderImpl implements FeeProvider {
  constructor(private readonly service: FeeSnapshotService) {}

  public getCurrentMinFees(): Promise<GasFees> {
    return this.service.getCurrentMinFees();
  }

  public getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    return this.service.getPredictedMinFees(manaUsage ?? ManaUsageEstimate.Target);
  }
}
