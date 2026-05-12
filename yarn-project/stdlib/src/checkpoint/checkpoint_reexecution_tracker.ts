import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

/**
 * Tracks checkpoints we have successfully re-executed locally. Consumed by the
 * data-withholding watcher as a short-circuit: if we re-executed a checkpoint, we know
 * its data was available to us at the time, so there's no need to probe the mempool
 * later.
 *
 * Entries are keyed by (checkpoint number, archive root) so two competing checkpoints at
 * the same number (e.g. equivocation) are tracked independently.
 */
export interface CheckpointReexecutionTracker {
  /** Record a successful re-execution for the given (checkpoint number, archive root). */
  recordReexecuted(checkpointNumber: CheckpointNumber, archiveRoot: Fr): void;

  /** Returns true if the given (checkpoint number, archive root) has been re-executed locally. */
  hasReexecuted(checkpointNumber: CheckpointNumber, archiveRoot: Fr): boolean;

  /** Drops entries for checkpoints with `number < checkpointNumber`. */
  removeBefore(checkpointNumber: CheckpointNumber): void;
}

/**
 * In-memory tracker backed by a per-checkpoint map of archive-root strings. Cleanup is
 * driven externally via `removeBefore` (typically by the proposal handler, once a
 * checkpoint reaches L1 finality).
 */
export class InMemoryCheckpointReexecutionTracker implements CheckpointReexecutionTracker {
  private readonly entries = new Map<number, Set<string>>();

  public recordReexecuted(checkpointNumber: CheckpointNumber, archiveRoot: Fr): void {
    let set = this.entries.get(checkpointNumber);
    if (!set) {
      set = new Set();
      this.entries.set(checkpointNumber, set);
    }
    set.add(archiveRoot.toString());
  }

  public hasReexecuted(checkpointNumber: CheckpointNumber, archiveRoot: Fr): boolean {
    return this.entries.get(checkpointNumber)?.has(archiveRoot.toString()) ?? false;
  }

  public removeBefore(checkpointNumber: CheckpointNumber): void {
    for (const n of this.entries.keys()) {
      if (n < checkpointNumber) {
        this.entries.delete(n);
      }
    }
  }
}
