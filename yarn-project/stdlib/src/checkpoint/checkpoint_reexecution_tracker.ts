import type { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

/**
 * Outcome of attempting to re-execute a checkpoint proposal locally.
 *
 * - `valid`        — re-execution succeeded and the computed checkpoint matched the proposal.
 * - `invalid`      — the proposal disagreed with the computed checkpoint, or violated a deterministic
 *                    constraint (limits, signatures, etc).
 * - `unvalidated`  — the local node could not complete validation for non-deterministic reasons
 *                    (missing blocks/txs, timeouts, infra errors). Treated as proposer-fault for
 *                    slashing but surfaced separately for telemetry.
 */
export type ReexecutionOutcome = 'valid' | 'invalid' | 'unvalidated';

/**
 * Tracks two pieces of per-slot state collected during proposal handling:
 *
 *  1. Whether each block proposal's transactions were successfully collected locally
 *     (keyed by `slot` + `indexWithinCheckpoint`). Consumed by the data-withholding watcher.
 *  2. The outcome of locally re-executing each checkpoint proposal (keyed by
 *     `(checkpointNumber, archiveRoot)` and by `slot`). Consumed by the data-withholding
 *     watcher (via `hasReexecuted`) and the sentinel (via `getOutcomeForSlot`).
 *
 * Both pieces of state live on the same per-slot `Entry`, so cleanup via `removeBefore`
 * naturally drops everything for a pruned slot in one step.
 */
interface Entry {
  // Set by recordOutcome — these may be undefined until the checkpoint proposal has been
  // evaluated. recordTxsCollected may create an Entry before any of them are known.
  checkpointNumber: CheckpointNumber | undefined;
  archiveRoot: string | undefined;
  outcome: ReexecutionOutcome | undefined;

  slot: SlotNumber;

  // Per block-proposal at this slot: indexWithinCheckpoint → true (collected) | false (failed to collect).
  txsCollected: Map<number, boolean>;
}

export class CheckpointReexecutionTracker {
  private readonly byCheckpoint = new Map<CheckpointNumber, Map<string, Entry>>();
  private readonly bySlot = new Map<SlotNumber, Entry>();

  /**
   * Record the outcome of evaluating a checkpoint proposal.
   * @param slot - Slot the proposal was for. Always required.
   * @param archiveRoot - Archive root in the proposal.
   * @param outcome - Outcome of evaluation.
   * @param checkpointNumber - Checkpoint number, if known. Required for `valid` outcomes; optional
   *   for `invalid`/`unvalidated` because some early rejections fire before blocks are loaded.
   */
  public recordOutcome(
    slot: SlotNumber,
    archiveRoot: Fr,
    outcome: ReexecutionOutcome,
    checkpointNumber?: CheckpointNumber,
  ): void {
    const archiveRootStr = archiveRoot.toString();

    // Preserve any per-block txsCollected already accumulated for this slot.
    const existing = this.bySlot.get(slot);
    const entry: Entry = {
      checkpointNumber,
      archiveRoot: archiveRootStr,
      slot,
      outcome,
      txsCollected: existing?.txsCollected ?? new Map(),
    };

    if (checkpointNumber !== undefined) {
      let archives = this.byCheckpoint.get(checkpointNumber);
      if (!archives) {
        archives = new Map();
        this.byCheckpoint.set(checkpointNumber, archives);
      }
      archives.set(archiveRootStr, entry);
    }

    this.bySlot.set(slot, entry);
  }

  /**
   * Record whether the local node successfully collected the transactions for a block proposal.
   * Called from the validator's proposal handler immediately after tx collection completes
   * (regardless of whether re-execution will subsequently succeed). The data-withholding
   * watcher consults these records as an authoritative signal: tx availability now is too
   * weak (txs may have been evicted from the mempool by the time the watcher runs), but a
   * record that the txs *were* available at proposal time still vouches for the proposer.
   *
   * @param slot - Slot the block proposal was for.
   * @param indexWithinCheckpoint - Index of the block within its enclosing checkpoint.
   * @param collected - True if every tx in the proposal was collected locally before deadline.
   */
  public recordTxsCollected(slot: SlotNumber, indexWithinCheckpoint: number, collected: boolean): void {
    let entry = this.bySlot.get(slot);
    if (!entry) {
      entry = {
        checkpointNumber: undefined,
        archiveRoot: undefined,
        slot,
        outcome: undefined,
        txsCollected: new Map(),
      };
      this.bySlot.set(slot, entry);
    }
    entry.txsCollected.set(indexWithinCheckpoint, collected);
  }

  /**
   * Returns true if the given (checkpoint number, archive root) has been successfully
   * re-executed locally (outcome `valid`).
   */
  public hasReexecuted(checkpointNumber: CheckpointNumber, archiveRoot: Fr): boolean {
    return this.byCheckpoint.get(checkpointNumber)?.get(archiveRoot.toString())?.outcome === 'valid';
  }

  /** Returns the recorded outcome for a given slot, or undefined if no proposal was evaluated. */
  public getOutcomeForSlot(slot: SlotNumber): ReexecutionOutcome | undefined {
    return this.bySlot.get(slot)?.outcome;
  }

  /**
   * Returns the recorded tx-collection result for a block proposal at the given slot and
   * `indexWithinCheckpoint`, or `undefined` if no record exists.
   *
   * Three-valued by design:
   *   - `true`      — we collected every tx for this block proposal before the deadline.
   *   - `false`     — we tried and failed (missing txs at the deadline).
   *   - `undefined` — no record (e.g. we never saw the block proposal). Callers should fall
   *                   back to a current-state check (e.g. mempool probe) for this case.
   */
  public getTxsCollectedRecord(slot: SlotNumber, indexWithinCheckpoint: number): boolean | undefined {
    return this.bySlot.get(slot)?.txsCollected.get(indexWithinCheckpoint);
  }

  /** Drops entries for checkpoints with `number < checkpointNumber`. */
  public removeBefore(checkpointNumber: CheckpointNumber): void {
    // Track the highest slot among checkpoints we're pruning. Once we know it, any slot
    // strictly below that watermark is older than the most recently pruned checkpoint and
    // can be dropped from `bySlot` too — including slot-only entries (no checkpoint number)
    // which would otherwise leak, because removing by checkpoint number can't reach them.
    let maxRemovedSlot: SlotNumber | undefined;
    for (const [n, archives] of this.byCheckpoint) {
      if (n < checkpointNumber) {
        for (const entry of archives.values()) {
          // Only drop the slot index if it still points at the entry we're removing.
          if (this.bySlot.get(entry.slot) === entry) {
            this.bySlot.delete(entry.slot);
          }
          if (maxRemovedSlot === undefined || entry.slot > maxRemovedSlot) {
            maxRemovedSlot = entry.slot;
          }
        }
        this.byCheckpoint.delete(n);
      }
    }

    if (maxRemovedSlot !== undefined) {
      for (const slot of [...this.bySlot.keys()]) {
        if (slot < maxRemovedSlot) {
          this.bySlot.delete(slot);
        }
      }
    }
  }
}
