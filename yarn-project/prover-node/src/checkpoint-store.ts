import type { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
<<<<<<< HEAD
import { RunningPromise } from '@aztec/foundation/promise';
=======
>>>>>>> origin/v5-next
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
<<<<<<< HEAD
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
=======
 *  - its checkpoint is pruned by an L1 reorg (`cancelAndRemoveAboveBlock`), or
 *  - its epoch's proof-submission window has closed (`reapExpired`), so the proof could no
 *    longer be accepted on L1 even if produced.
 *
 * A prover's sub-tree work forks world-state per block and does not survive a prune of a base
 * block, so there is nothing to preserve across a reorg: a pruned prover is cancelled and
 * dropped, and a re-add (even of identical content) constructs a fresh prover.
 */
export class CheckpointStore {
  private readonly provers = new Map<string, CheckpointProver>();
  /**
   * Teardowns of provers already removed from `provers` (by prune or reap), awaited on `stop()`.
   * Keyed by a monotonic id rather than the prover's content id: a prune-then-re-add can leave two
   * teardowns for the same content id in flight at once, which a content-id key would clobber.
   */
  private readonly pendingTeardowns = new Map<number, Promise<void>>();
  private nextTeardownId = 0;
  private readonly log: Logger;

  constructor(
    private readonly l2BlockSource: Pick<L2BlockSource, 'getL1Constants'>,
    private readonly proverDeps: Omit<CheckpointProverDeps, 'log'>,
>>>>>>> origin/v5-next
    bindings?: LoggerBindings,
    private readonly proverFactoryFn: CheckpointProverFactory = (args, deps) => new CheckpointProver(args, deps),
  ) {
    this.log = createLogger('prover-node:checkpoint-store', bindings);
<<<<<<< HEAD
    this.slotWatcher = new RunningPromise(
      () => this.reapPrunedPastSlot(),
      this.log,
      this.options.slotWatcherPollIntervalMs,
    );
  }

  public start(): Promise<void> {
    this.slotWatcher.start();
=======
  }

  public start(): Promise<void> {
>>>>>>> origin/v5-next
    return Promise.resolve();
  }

  public async stop(): Promise<void> {
<<<<<<< HEAD
    await this.slotWatcher.stop();
    // Cancel every live prover; await teardown.
=======
    // Cancel every live prover, then await both their teardown and any still in flight for provers
    // already removed by a prune or reap.
>>>>>>> origin/v5-next
    const provers = Array.from(this.provers.values());
    this.provers.clear();
    for (const prover of provers) {
      prover.cancel();
    }
<<<<<<< HEAD
    await Promise.allSettled(provers.map(p => p.whenDone()));
=======
    await Promise.allSettled([...provers.map(p => p.whenDone()), ...this.pendingTeardowns.values()]);
  }

  /**
   * Tracks the teardown of a prover just removed from the store so `stop()` can await it. The entry
   * removes itself once teardown settles, so the map stays bounded by the number in flight.
   */
  private trackTeardown(prover: CheckpointProver): void {
    const id = this.nextTeardownId++;
    const done = prover.whenDone();
    this.pendingTeardowns.set(id, done);
    void done.finally(() => this.pendingTeardowns.delete(id));
>>>>>>> origin/v5-next
  }

  /**
   * Registers a checkpoint with the store. If a prover already exists for the
<<<<<<< HEAD
   * `(number, slot, archive root)` content key, it is reused and marked canonical;
   * otherwise a new prover is constructed.
=======
   * `(number, slot, archive root)` content key it is reused (an at-least-once re-registration of
   * still-canonical content); otherwise a new prover is constructed.
>>>>>>> origin/v5-next
   */
  public async addOrUpdate(checkpoint: Checkpoint, data: RegisterCheckpointData): Promise<CheckpointProver> {
    const l1Constants = await this.l2BlockSource.getL1Constants();
    const epochNumber = getEpochAtSlot(checkpoint.header.slotNumber, l1Constants);
    const id = CheckpointProver.idFor(checkpoint);

    const existing = this.provers.get(id);
    if (existing) {
<<<<<<< HEAD
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
=======
      return existing;
    }

    // At most one canonical checkpoint per slot. A different checkpoint at the same slot means the
    // caller forgot to prune the old chain before adding the replacement — surface it rather than
    // silently creating a parallel canonical chain. A pruned checkpoint has already been removed,
    // so every prover still in the store is canonical.
    for (const prover of this.provers.values()) {
      if (prover.slotNumber === checkpoint.header.slotNumber) {
        throw new Error(
          `Cannot add checkpoint ${checkpoint.number} (archive ${checkpoint.archive.root}) at slot ${checkpoint.header.slotNumber}: ` +
            `a different checkpoint already occupies this slot. Prune it first.`,
>>>>>>> origin/v5-next
        );
      }
    }

    const prover = this.proverFactoryFn({ ...data, checkpoint, epochNumber }, { ...this.proverDeps, log: this.log });
    this.provers.set(id, prover);
    return prover;
  }

  /**
<<<<<<< HEAD
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
=======
   * Cancels and removes every prover that holds a block above the prune target. A checkpoint is orphaned by a prune to
   * block `targetBlockNumber` iff its last block sits above the target — including a checkpoint whose range straddles
   * the target (partially orphaned), which block-range marking catches without boundary ambiguity. Keying off the
   * surviving block number (rather than a checkpoint number) is correct even when the source has already
   * re-checkpointed past the divergence: the prune event reports the highest surviving block, which by construction
   * survives on the source, whereas the source's current checkpointed tip can sit above the prune target.
   *
   * The prover's in-flight sub-tree work forks world-state per block and faults once its base block is pruned, so it
   * cannot be reused; it is cancelled (aborting the fork reads) and dropped. A subsequent re-add constructs a fresh
   * prover. Returns the removed provers.
   */
  public cancelAndRemoveAboveBlock(targetBlockNumber: BlockNumber): CheckpointProver[] {
    const affected: CheckpointProver[] = [];
    for (const [id, prover] of Array.from(this.provers.entries())) {
      const lastBlockNumber = prover.checkpoint.blocks.at(-1)!.number;
      if (lastBlockNumber > targetBlockNumber) {
        prover.cancel();
        this.trackTeardown(prover);
        this.provers.delete(id);
>>>>>>> origin/v5-next
        affected.push(prover);
      }
    }
    return affected;
  }

  /**
<<<<<<< HEAD
   * Drops canonical (non-pruned) provers whose epoch is at or below the supplied expired
   * epoch. Once an epoch's proof-submission window has closed, its proof can no longer be
   * accepted on L1, so the prover is no longer needed.
=======
   * Drops provers whose epoch is at or below the supplied expired epoch. Once an epoch's
   * proof-submission window has closed, its proof can no longer be accepted on L1, so the
   * prover is no longer needed.
>>>>>>> origin/v5-next
   */
  public reapExpired(expiredEpoch: EpochNumber): void {
    const reaped: { id: string; checkpointNumber: CheckpointNumber; epochNumber: EpochNumber }[] = [];
    for (const [id, prover] of Array.from(this.provers.entries())) {
<<<<<<< HEAD
      if (prover.isPruned()) {
        continue;
      }
      if (prover.epochNumber <= expiredEpoch) {
        reaped.push({ id, checkpointNumber: prover.checkpoint.number, epochNumber: prover.epochNumber });
        prover.cancel({ routine: true });
        void prover.whenDone();
=======
      if (prover.epochNumber <= expiredEpoch) {
        reaped.push({ id, checkpointNumber: prover.checkpoint.number, epochNumber: prover.epochNumber });
        prover.cancel({ routine: true });
        this.trackTeardown(prover);
>>>>>>> origin/v5-next
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

<<<<<<< HEAD
  /** Every prover currently in the store (canonical and pruned), in insertion order. */
=======
  /** Every prover currently in the store, in insertion order. */
>>>>>>> origin/v5-next
  public listAll(): CheckpointProver[] {
    return Array.from(this.provers.values());
  }

<<<<<<< HEAD
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
=======
  /** Provers in the store, sorted by checkpoint number. */
  public list(): CheckpointProver[] {
    return Array.from(this.provers.values()).sort((a, b) => a.checkpoint.number - b.checkpoint.number);
  }

  /**
   * Provers whose slot is in the supplied epoch's slot range, sorted by checkpoint number.
   */
  public async listForEpoch(epoch: EpochNumber): Promise<CheckpointProver[]> {
    const l1Constants = await this.l2BlockSource.getL1Constants();
    const [fromSlot, toSlot] = getSlotRangeForEpoch(epoch, l1Constants);
    return this.listInSlotRange(fromSlot, toSlot);
  }

  /** Provers whose slot falls within `[fromSlot, toSlot]`, sorted by checkpoint number. */
  public listInSlotRange(fromSlot: SlotNumber, toSlot: SlotNumber): CheckpointProver[] {
    return this.list().filter(p => p.slotNumber >= fromSlot && p.slotNumber <= toSlot);
>>>>>>> origin/v5-next
  }
}

/** Sub-set of `L1RollupConstants` actually consumed by the store's slot helpers. */
export type CheckpointStoreL1Constants = Pick<L1RollupConstants, 'epochDuration'>;
