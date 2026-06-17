import type { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';

import { CheckpointProver, type CheckpointProverArgs, type CheckpointProverDeps } from './job/checkpoint-prover.js';

/** Register-time data needed to construct a `CheckpointProver` (everything except the checkpoint + epoch). */
export type RegisterCheckpointData = Omit<CheckpointProverArgs, 'checkpoint' | 'epochNumber'>;

/** Factory used by the store to construct new provers. Tests can inject a stub. */
export type CheckpointProverFactory = (args: CheckpointProverArgs, deps: CheckpointProverDeps) => CheckpointProver;

/**
 * Prover-node-wide registry of `CheckpointProver` instances, content-addressed by
 * `(checkpoint number, slot, checkpoint archive root)`.
 *
 * The store survives every epoch / session boundary. A prover lives from its first
 * `addOrUpdate` call until either:
 *  - it has been pruned and the L2 chain has moved past its slot (no re-add possible), or
 *  - its epoch's proof-submission window has closed (`reapExpired`), so the proof could no
 *    longer be accepted on L1 even if produced.
 *
 * A re-add of a checkpoint that matches an existing prover's content key reuses the
 * existing prover (and flips it back to canonical); the in-flight sub-tree work never
 * stops, so a prune-then-re-add of the same content avoids re-proving entirely.
 */
export class CheckpointStore {
  private readonly provers = new Map<string, CheckpointProver>();
  private readonly slotWatcher: RunningPromise;
  private readonly log: Logger;

  constructor(
    private readonly l2BlockSource: Pick<L2BlockSource, 'getSyncedL2SlotNumber' | 'getL1Constants'>,
    private readonly proverDeps: Omit<CheckpointProverDeps, 'log'>,
    private readonly options: { slotWatcherPollIntervalMs: number },
    bindings?: LoggerBindings,
    private readonly proverFactoryFn: CheckpointProverFactory = (args, deps) => new CheckpointProver(args, deps),
  ) {
    this.log = createLogger('prover-node:checkpoint-store', bindings);
    this.slotWatcher = new RunningPromise(
      () => this.reapPrunedPastSlot(),
      this.log,
      this.options.slotWatcherPollIntervalMs,
    );
  }

  public start(): Promise<void> {
    this.slotWatcher.start();
    return Promise.resolve();
  }

  public async stop(): Promise<void> {
    await this.slotWatcher.stop();
    // Cancel every live prover; await teardown.
    const provers = Array.from(this.provers.values());
    this.provers.clear();
    for (const prover of provers) {
      prover.cancel();
    }
    await Promise.allSettled(provers.map(p => p.whenDone()));
  }

  /**
   * Registers a checkpoint with the store. If a prover already exists for the
   * `(number, slot, archive root)` content key, it is reused and marked canonical;
   * otherwise a new prover is constructed.
   */
  public async addOrUpdate(checkpoint: Checkpoint, data: RegisterCheckpointData): Promise<CheckpointProver> {
    const l1Constants = await this.l2BlockSource.getL1Constants();
    const epochNumber = getEpochAtSlot(checkpoint.header.slotNumber, l1Constants);
    const id = CheckpointProver.idFor(checkpoint);

    const existing = this.provers.get(id);
    if (existing) {
      existing.markCanonical();
      return existing;
    }

    // At most one canonical checkpoint per slot. A different canonical checkpoint at the
    // same slot means the caller forgot to prune the old chain before adding the replacement
    // — surface it rather than silently creating a parallel canonical chain.
    for (const prover of this.provers.values()) {
      if (prover.slotNumber === checkpoint.header.slotNumber && !prover.isPruned()) {
        throw new Error(
          `Cannot add checkpoint ${checkpoint.number} (archive ${checkpoint.archive.root}) at slot ${checkpoint.header.slotNumber}: ` +
            `a different canonical checkpoint already occupies this slot. Prune it first.`,
        );
      }
    }

    const prover = this.proverFactoryFn({ ...data, checkpoint, epochNumber }, { ...this.proverDeps, log: this.log });
    this.provers.set(id, prover);
    return prover;
  }

  /**
   * Marks every canonical prover that holds a block above the prune target as pruned. A checkpoint is orphaned by a
   * prune to block `targetBlockNumber` iff its last block sits above the target — including a checkpoint whose range
   * straddles the target (partially orphaned), which block-range marking catches without boundary ambiguity. Keying
   * off the surviving block number (rather than a checkpoint number) is correct even when the source has already
   * re-checkpointed past the divergence: the prune event reports the highest surviving block, which by construction
   * survives on the source, whereas the source's current checkpointed tip can sit above the prune target.
   * Sub-tree work keeps running so a re-add of the same content can pick it up. Returns the affected provers.
   */
  public markPrunedAboveBlock(targetBlockNumber: BlockNumber): CheckpointProver[] {
    const affected: CheckpointProver[] = [];
    for (const prover of this.provers.values()) {
      const lastBlockNumber = prover.checkpoint.blocks.at(-1)!.number;
      if (lastBlockNumber > targetBlockNumber && !prover.isPruned()) {
        prover.markPruned();
        affected.push(prover);
      }
    }
    return affected;
  }

  /**
   * Drops canonical (non-pruned) provers whose epoch is at or below the supplied expired
   * epoch. Once an epoch's proof-submission window has closed, its proof can no longer be
   * accepted on L1, so the prover is no longer needed.
   */
  public reapExpired(expiredEpoch: EpochNumber): void {
    const reaped: { id: string; checkpointNumber: CheckpointNumber; epochNumber: EpochNumber }[] = [];
    for (const [id, prover] of Array.from(this.provers.entries())) {
      if (prover.isPruned()) {
        continue;
      }
      if (prover.epochNumber <= expiredEpoch) {
        reaped.push({ id, checkpointNumber: prover.checkpoint.number, epochNumber: prover.epochNumber });
        prover.cancel({ routine: true });
        void prover.whenDone();
        this.provers.delete(id);
      }
    }
    if (reaped.length > 0) {
      this.log.info(`Reaped ${reaped.length} expired CheckpointProver(s) for expiredEpoch ${expiredEpoch}`, {
        expiredEpoch,
        reapedCount: reaped.length,
        reaped,
      });
    }
  }

  /** Returns the prover with the supplied id, or undefined. */
  public get(id: string): CheckpointProver | undefined {
    return this.provers.get(id);
  }

  /** Returns the prover for the supplied checkpoint (by its content-addressed id), or undefined. */
  public getByCheckpoint(checkpoint: Checkpoint): CheckpointProver | undefined {
    return this.provers.get(CheckpointProver.idFor(checkpoint));
  }

  /** Every prover currently in the store (canonical and pruned), in insertion order. */
  public listAll(): CheckpointProver[] {
    return Array.from(this.provers.values());
  }

  /** Canonical (non-pruned) provers in the store, sorted by checkpoint number. */
  public listCanonical(): CheckpointProver[] {
    return Array.from(this.provers.values())
      .filter(p => !p.isPruned())
      .sort((a, b) => a.checkpoint.number - b.checkpoint.number);
  }

  /**
   * Canonical provers whose slot is in the supplied epoch's slot range, sorted by
   * checkpoint number.
   */
  public async listCanonicalForEpoch(epoch: EpochNumber): Promise<CheckpointProver[]> {
    const l1Constants = await this.l2BlockSource.getL1Constants();
    const [fromSlot, toSlot] = getSlotRangeForEpoch(epoch, l1Constants);
    return this.listCanonicalInSlotRange(fromSlot, toSlot);
  }

  /** Canonical provers whose slot falls within `[fromSlot, toSlot]`, sorted by checkpoint number. */
  public listCanonicalInSlotRange(fromSlot: SlotNumber, toSlot: SlotNumber): CheckpointProver[] {
    return this.listCanonical().filter(p => p.slotNumber >= fromSlot && p.slotNumber <= toSlot);
  }

  /**
   * SlotWatcher tick: reap pruned provers whose slot has passed the chain's synced
   * slot. Once the chain has moved past, no re-add can revive the prover and its
   * content key is unique enough that an actual re-add would create a new entry.
   *
   * Protected so unit tests can drive a single tick without spinning up the
   * `RunningPromise` and waiting on its interval.
   */
  protected async reapPrunedPastSlot(): Promise<void> {
    let syncedSlot: SlotNumber | undefined;
    try {
      syncedSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
    } catch (err) {
      this.log.debug(`SlotWatcher could not read synced slot`, { error: `${err}` });
      return;
    }
    if (syncedSlot === undefined) {
      return;
    }
    for (const [id, prover] of Array.from(this.provers.entries())) {
      if (prover.isPruned() && prover.slotNumber < syncedSlot) {
        this.log.info(`Reaping pruned CheckpointProver ${id}: slot ${prover.slotNumber} < synced ${syncedSlot}`, {
          checkpointNumber: prover.checkpoint.number,
          slotNumber: prover.slotNumber,
        });
        prover.cancel();
        void prover.whenDone();
        this.provers.delete(id);
      }
    }
  }
}

/** Sub-set of `L1RollupConstants` actually consumed by the store's slot helpers. */
export type CheckpointStoreL1Constants = Pick<L1RollupConstants, 'epochDuration'>;
