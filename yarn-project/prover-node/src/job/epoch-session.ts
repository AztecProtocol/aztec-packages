import { BlockNumber, type CheckpointNumber, type EpochNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import { TopTreeCancelledError } from '@aztec/prover-client/orchestrator';
import { type EpochProvingJobState, EpochProvingJobTerminalState } from '@aztec/stdlib/interfaces/server';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProofPublishingService } from '../proof-publishing-service.js';
import { CheckpointProver } from './checkpoint-prover.js';
import { TopTreeJob, type TopTreeJobHooks, type TopTreeProof } from './top-tree-job.js';

export type { EpochProvingJobState };

/** Full vs partial — the only behavioural difference is at the L1 submission step. */
export type SessionKind = 'full' | 'partial';

/**
 * Identifies what a session proves: a contiguous slot range within an epoch. The
 * concrete prover set the session holds is the *implementation* of the spec — frozen
 * at construction time, derived from the canonical content for `[fromSlot, toSlot]`.
 *
 * Reconciliation in `ProverNode` is uniform across kinds: whenever the canonical
 * content for the slot range changes, the session is cancelled and replaced with a
 * fresh session that **preserves the slot range** but adopts the new checkpoints.
 *
 * Kind affects only the publishing decision (see `EpochSession`).
 */
export interface SessionSpec {
  kind: SessionKind;
  epochNumber: EpochNumber;
  fromSlot: SlotNumber;
  toSlot: SlotNumber;
}

/** Stable string key for use in maps. */
export function specKey(spec: SessionSpec): string {
  return `${spec.kind}:${spec.epochNumber}:${spec.fromSlot}-${spec.toSlot}`;
}

/** Hooks tests use to interpose around the top-tree prove without monkey-patching. */
export type EpochSessionHooks = {
  beforeTopTreeProve?: () => Promise<void> | void;
  afterTopTreeProve?: () => Promise<void> | void;
  topTreeProveOverride?: (defaultProve: () => Promise<TopTreeProof>) => Promise<TopTreeProof>;
};

export type EpochSessionOptions = {
  /**
   * If set, the session sleeps this many ms after `start()` (before the TopTreeJob is
   * constructed). Lets late-arriving events (e.g. a prune) be processed before
   * top-tree proving begins.
   */
  finalizationDelayMs?: number;
};

/** Dependencies an `EpochSession` needs at construction. */
export type EpochSessionDeps = {
  proverFactory: EpochProverFactory;
  proverId: EthAddress;
  publishingService: Pick<ProofPublishingService, 'submit' | 'withdraw'>;
  metrics: ProverNodeJobMetrics;
  dateProvider: DateProvider;
  /** Optional proving deadline. The session enters `timed-out` if exceeded. */
  deadline: Date | undefined;
  config: EpochSessionOptions;
  bindings?: LoggerBindings;
  hooks?: EpochSessionHooks;
};

/**
 * One attempt at proving and publishing a contiguous slot range. The `SessionSpec` and
 * the prover set are both frozen at construction time; the session does not adapt to
 * reorgs or extensions of canonical content. Instead, `SessionManager` owns the
 * reconciliation loop and replaces invalidated sessions wholesale (cancel + construct
 * a fresh session with the new prover set).
 *
 * Each session does three things in sequence:
 *
 *   1. Run a `TopTreeJob` over its frozen prover subset to produce the epoch proof.
 *   2. Hand the proof to the shared `ProofPublishingService` as a `PublishCandidate`.
 *   3. Translate the service's outcome into a terminal session state.
 *
 * Everything to do with submission — predecessor gating, same-epoch dedup, deadline
 * enforcement, and the L1 transaction itself — is the publishing service's concern.
 * The session is just the producer of one candidate and the observer of its outcome.
 *
 * Lifecycle (happy path):
 *
 *   initialized → awaiting-checkpoints → awaiting-root → publishing-proof → completed
 *
 * Terminal states map the publishing outcome: `published` → `completed`, `superseded` →
 * `superseded`, `expired` → `timed-out`, `withdrawn` → `cancelled`. A proving fault or a failed
 * L1 submission ends the attempt in `stopped` — a non-declaring terminal state that lets the
 * reconciler retry the epoch; the epoch is only declared `failed` at submission-window expiry.
 * Additionally, the session-level deadline fires `cancel('deadline')` and transitions
 * to `timed-out` for the pre-submit window (top-tree proving) — the publishing service
 * handles the post-submit window via the candidate's `deadline`.
 *
 * `cancel()` is idempotent. It marks the session terminal, calls
 * `publishingService.withdraw(uuid)` to drop any queued candidate (an in-flight publish
 * runs to natural completion; the session has already settled), and tears down the
 * top-tree job if proving is still in progress.
 */
export class EpochSession implements Traceable {
  public readonly tracer: Tracer;
  private readonly uuid: string;
  private readonly log: Logger;
  private state: EpochProvingJobState = 'initialized';
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  private topTreeJob: TopTreeJob | undefined;
  /** Cancelled top-tree jobs whose teardown is still in flight. Awaited at session stop. */
  private readonly pendingTopTreeCleanups: TopTreeJob[] = [];

  private readonly completionPromise: Promise<EpochProvingJobState>;
  private resolveCompletion!: (state: EpochProvingJobState) => void;

  /** Stable reference; never mutated after construction. */
  private readonly checkpoints: readonly CheckpointProver[];

  constructor(
    private readonly spec: SessionSpec,
    checkpoints: readonly CheckpointProver[],
    private readonly deps: EpochSessionDeps,
  ) {
    if (checkpoints.length === 0) {
      throw new Error(`Cannot construct EpochSession for ${specKey(spec)}: empty checkpoint set`);
    }
    this.checkpoints = [...checkpoints];
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-session', {
      ...deps.bindings,
      instanceId: `session-${spec.kind}-${spec.epochNumber}-${spec.fromSlot}-${spec.toSlot}`,
    });
    this.tracer = deps.metrics.tracer;
    this.completionPromise = new Promise(resolve => {
      this.resolveCompletion = resolve;
    });
    this.scheduleDeadlineStop();
    this.log.info(`Created EpochSession ${this.uuid}`, {
      uuid: this.uuid,
      ...spec,
      checkpointCount: this.checkpoints.length,
      checkpointIds: this.checkpoints.map(c => c.id),
    });
  }

  public getId(): string {
    return this.uuid;
  }

  public getSpec(): SessionSpec {
    return this.spec;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  public getEpochNumber(): EpochNumber {
    return this.spec.epochNumber;
  }

  public getKind(): SessionKind {
    return this.spec.kind;
  }

  public getDeadline(): Date | undefined {
    return this.deps.deadline;
  }

  public getCheckpoints(): readonly CheckpointProver[] {
    return this.checkpoints;
  }

  /** Resolves when the session reaches a terminal state. */
  public whenDone(): Promise<EpochProvingJobState> {
    return this.completionPromise;
  }

  /** True if the session is in a terminal state. */
  public isTerminal(): boolean {
    return EpochProvingJobTerminalState.includes(this.state);
  }

  /** First block this session proves. */
  public getStartBlockNumber(): BlockNumber {
    return BlockNumber(this.checkpoints[0].checkpoint.blocks[0].number);
  }

  /** Last block this session proves. */
  public getEndBlockNumber(): BlockNumber {
    const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];
    return BlockNumber(lastCheckpoint.checkpoint.blocks[lastCheckpoint.checkpoint.blocks.length - 1].number);
  }

  /**
   * Kicks off proving + submission. Fires and forgets — callers should await `whenDone()`.
   * Returns a promise that resolves to the final state for callers that want to wait inline.
   */
  @trackSpan('EpochSession.start', function () {
    return { [Attributes.EPOCH_NUMBER]: this.spec.epochNumber };
  })
  public async start(): Promise<EpochProvingJobState> {
    try {
      await this.run();
    } catch (err) {
      this.log.error(`Error in EpochSession ${this.uuid}`, err, {
        uuid: this.uuid,
        ...this.spec,
      });
      // A proving or submission fault is a fact about this attempt, not a decision that the epoch
      // has failed. End in the non-declaring terminal 'stopped' (never 'failed'): the reconciler
      // rebuilds the session over current canonical content, and the epoch is declared 'failed'
      // — with a post-mortem upload — only at its L1 proof-submission-window expiry.
      if (!this.isTerminal()) {
        this.state = 'stopped';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.teardownTopTreeIfNeeded();
      this.resolveCompletion(this.state);
    }
    return this.state;
  }

  /**
   * Cancels the session. Idempotent. Withdraws any submitted candidate from the
   * publishing service so the in-flight publisher (if any) is interrupted.
   */
  public async cancel(reason = 'cancelled', { abortJobs = true }: { abortJobs?: boolean } = {}): Promise<void> {
    if (this.isTerminal()) {
      return;
    }
    this.log.info(`Cancelling EpochSession ${this.uuid}: ${reason}`, {
      uuid: this.uuid,
      ...this.spec,
      previousState: this.state,
      reason,
    });
    this.state = 'cancelled';
    try {
      this.deps.publishingService.withdraw(this.uuid);
    } catch (err) {
      this.log.error(`Error withdrawing candidate from publishing service`, err);
    }
    if (this.topTreeJob && !this.topTreeJob.isCancelled()) {
      const job = this.topTreeJob;
      this.topTreeJob = undefined;
      // On a clean shutdown we leave the in-flight broker jobs alone so a restart can reuse them;
      // other cancellations (reorg, supersede, deadline) abort them since their inputs are stale.
      job.cancel(abortJobs);
      this.pendingTopTreeCleanups.push(job);
    }
    await this.teardownTopTreeIfNeeded();
    this.resolveCompletion(this.state);
  }

  private async run(): Promise<void> {
    const timer = new Timer();

    if (this.deps.config.finalizationDelayMs && this.deps.config.finalizationDelayMs > 0) {
      this.log.warn(`Waiting ${this.deps.config.finalizationDelayMs}ms before starting top-tree proving`, {
        uuid: this.uuid,
        ...this.spec,
      });
      await sleep(this.deps.config.finalizationDelayMs);
      if (this.isTerminal()) {
        return;
      }
    }

    // Stage 1 — top-tree proving.
    const topTreeJob = new TopTreeJob(this.spec.epochNumber, this.checkpoints, {
      proverFactory: this.deps.proverFactory,
      metrics: this.deps.metrics,
      log: this.log,
      hooks: this.toTopTreeHooks(),
    });
    this.topTreeJob = topTreeJob;
    const { fromCheckpoint, toCheckpoint, count } = topTreeJob.getRange();

    this.state = 'awaiting-checkpoints';
    let proof: TopTreeProof;
    try {
      proof = await topTreeJob.start();
    } catch (err) {
      if (err instanceof TopTreeCancelledError) {
        // Session cancel kicked off the underlying teardown; nothing more to do here.
        this.log.info(`Top-tree cancelled for EpochSession ${this.uuid}`, { uuid: this.uuid, ...this.spec });
        return;
      }
      throw err;
    }
    this.topTreeJob = undefined;
    this.log.info(`Top-tree proof ready for EpochSession ${this.uuid}`, {
      uuid: this.uuid,
      ...this.spec,
      fromCheckpoint,
      toCheckpoint,
      durationMs: timer.ms(),
    });

    // Stage 2 — hand the proof to the publishing service and wait for its verdict.
    await this.submitProof(proof, fromCheckpoint, toCheckpoint, count, timer);
  }

  private async submitProof(
    proof: TopTreeProof,
    fromCheckpoint: CheckpointNumber,
    toCheckpoint: CheckpointNumber,
    checkpointCount: number,
    timer: Timer,
  ): Promise<void> {
    // Attestations come from the highest-numbered registered checkpoint — that's the one
    // whose attestations the L1 contract checks for the proven range.
    const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];
    const attestations = lastCheckpoint.attestations.map(a => a.toViem());
    const epochSizeBlocks = this.checkpoints.reduce((acc, c) => acc + c.checkpoint.blocks.length, 0);
    const epochSizeTxs = this.checkpoints.reduce(
      (acc, c) => acc + c.checkpoint.blocks.reduce((bAcc, block) => bAcc + block.body.txEffects.length, 0),
      0,
    );

    // Reflect the publish phase. Guard against a terminal state set concurrently by cancel() — the
    // post-submit isTerminal() check below relies on cancel still winning.
    if (!this.isTerminal()) {
      this.state = 'publishing-proof';
    }

    const outcome = await this.deps.publishingService.submit({
      id: this.uuid,
      epoch: this.spec.epochNumber,
      kind: this.spec.kind,
      startBlock: this.getStartBlockNumber(),
      endBlock: this.getEndBlockNumber(),
      deadline: this.deps.deadline,
      fromCheckpoint,
      toCheckpoint,
      publicInputs: proof.publicInputs,
      proof: proof.proof,
      batchedBlobInputs: proof.batchedBlobInputs,
      attestations,
      headers: this.checkpoints.map(c => c.checkpoint.header),
    });

    if (this.isTerminal()) {
      // cancel() already set the terminal state — don't clobber it.
      return;
    }

    switch (outcome) {
      case 'published':
        this.log.info(
          `Submitted proof for epoch ${this.spec.epochNumber} (checkpoints ${fromCheckpoint}..${toCheckpoint})`,
          { uuid: this.uuid, ...this.spec },
        );
        this.state = 'completed';
        this.deps.metrics.recordProvingJob(timer.ms(), checkpointCount, epochSizeBlocks, epochSizeTxs);
        return;
      case 'superseded':
        this.log.info(`EpochSession ${this.uuid} superseded by a longer candidate`, {
          uuid: this.uuid,
          ...this.spec,
        });
        this.state = 'superseded';
        return;
      case 'withdrawn':
        // cancel() ran but the terminal-state check above missed it. Defensive: treat as cancelled.
        this.state = 'cancelled';
        return;
      case 'expired':
        this.log.warn(`EpochSession ${this.uuid} expired before publishing`, { uuid: this.uuid, ...this.spec });
        this.state = 'timed-out';
        return;
      case 'failed':
        throw new Error('Failed to submit epoch proof to L1');
    }
  }

  private async teardownTopTreeIfNeeded(): Promise<void> {
    if (this.topTreeJob) {
      const job = this.topTreeJob;
      this.topTreeJob = undefined;
      job.cancel();
      this.pendingTopTreeCleanups.push(job);
    }
    if (this.pendingTopTreeCleanups.length > 0) {
      await Promise.allSettled(this.pendingTopTreeCleanups.map(j => j.whenDone()));
      this.pendingTopTreeCleanups.length = 0;
    }
  }

  private scheduleDeadlineStop(): void {
    const deadline = this.deps.deadline;
    if (!deadline) {
      return;
    }
    const timeout = Math.max(deadline.getTime() - this.deps.dateProvider.now(), 0);
    this.deadlineTimeoutHandler = setTimeout(() => {
      void this.handleDeadline();
    }, timeout);
  }

  /**
   * Returns a promise that resolves once cancellation has propagated and the state has
   * been flipped from 'cancelled' to 'timed-out'. Protected so unit tests can drive the
   * deadline path without waiting on the real `setTimeout` to fire.
   */
  protected async handleDeadline(): Promise<void> {
    if (this.isTerminal()) {
      return;
    }
    this.log.warn(`EpochSession ${this.uuid} hit deadline`, { uuid: this.uuid, ...this.spec });
    await this.cancel('deadline');
    // After cancel, override state if it was the canonical timeout case so observers see 'timed-out'.
    if (this.state === 'cancelled') {
      this.state = 'timed-out';
    }
  }

  private toTopTreeHooks(): TopTreeJobHooks {
    const hooks = this.deps.hooks;
    return {
      // `beforeProve` fires once the sub-tree (checkpoint block) proofs are ready and the root prove is
      // about to start — the boundary between `awaiting-checkpoints` and proving the top tree. Don't
      // clobber a terminal state set concurrently by cancel().
      beforeProve: async () => {
        if (!this.isTerminal()) {
          this.state = 'awaiting-root';
        }
        await hooks?.beforeTopTreeProve?.();
      },
      afterProve: hooks?.afterTopTreeProve,
      proveOverride: hooks?.topTreeProveOverride,
    };
  }
}
