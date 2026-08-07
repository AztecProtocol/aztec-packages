import type { L1SyncSnapshot } from '@aztec/ethereum/l1-types';

import { FeeSnapshotService } from '../global_variable_builder/fee_snapshot_service.js';
import type { FeeSnapshot, RefreshCause } from '../global_variable_builder/fee_snapshot_types.js';

/** Counters collected by {@link TestFeeSnapshotService} for asserting refresh behavior in tests. */
export type FeeSnapshotStats = {
  /** Total refreshes that published a snapshot. */
  refreshes: number;
  /** Total refresh failures (kept last-good, retried with backoff). */
  refreshFailures: number;
  /** Reads that had to trigger a refresh because the warm snapshot did not serve them (identity or coverage). */
  readTriggeredRefreshes: number;
};

/**
 * Fee snapshot service that tallies refresh outcomes so tests can assert the zero-L1 warm path, refresh sharing,
 * and failure handling without the production service carrying counters.
 */
export class TestFeeSnapshotService extends FeeSnapshotService {
  public readonly stats: FeeSnapshotStats = { refreshes: 0, refreshFailures: 0, readTriggeredRefreshes: 0 };

  protected override refreshForRead(deadline: number): Promise<void> {
    this.stats.readTriggeredRefreshes++;
    return super.refreshForRead(deadline);
  }

  protected override async runRefresh(identity: L1SyncSnapshot, cause: RefreshCause): Promise<FeeSnapshot> {
    try {
      const snapshot = await super.runRefresh(identity, cause);
      this.stats.refreshes++;
      return snapshot;
    } catch (err) {
      this.stats.refreshFailures++;
      throw err;
    }
  }
}
