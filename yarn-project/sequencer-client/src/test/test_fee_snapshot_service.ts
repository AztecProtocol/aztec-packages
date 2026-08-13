import type { L1SyncSnapshot } from '@aztec/ethereum/l1-types';

import { FeeSnapshotService } from '../global_variable_builder/fee_snapshot_service.js';
import type { FeeSnapshot } from '../global_variable_builder/fee_snapshot_types.js';

/** Counters collected by {@link TestFeeSnapshotService} for asserting refresh behavior in tests. */
export type FeeSnapshotStats = {
  /** Total refreshes that published a snapshot. */
  refreshes: number;
  /** Total refresh failures (the last-good snapshot stays stored). */
  refreshFailures: number;
};

/**
 * Fee snapshot service that tallies refresh outcomes and exposes the stored snapshot, so tests can assert the
 * zero-L1 warm path, refresh sharing, and failure handling without the production service carrying counters.
 */
export class TestFeeSnapshotService extends FeeSnapshotService {
  public readonly stats: FeeSnapshotStats = { refreshes: 0, refreshFailures: 0 };

  /** Returns the currently published snapshot, if any. */
  public getSnapshot(): FeeSnapshot | undefined {
    return this.snapshot;
  }

  protected override async runRefresh(identity: L1SyncSnapshot): Promise<FeeSnapshot> {
    try {
      const snapshot = await super.runRefresh(identity);
      this.stats.refreshes++;
      return snapshot;
    } catch (err) {
      this.stats.refreshFailures++;
      throw err;
    }
  }
}
