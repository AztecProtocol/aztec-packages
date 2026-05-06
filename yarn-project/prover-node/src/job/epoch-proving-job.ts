import type { ARCHIVE_HEIGHT } from '@aztec/constants';
import { CheckpointNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { Tuple } from '@aztec/foundation/serialize';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import { type EpochProvingContext, TopTreeCancelledError } from '@aztec/prover-client/orchestrator';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { CommitteeAttestation } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
} from '@aztec/stdlib/interfaces/server';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import * as crypto from 'node:crypto';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { ProverNodePublisher } from '../prover-node-publisher.js';
import { CheckpointJob, type CheckpointJobDeps } from './checkpoint-job.js';
import type { EpochProvingJobData } from './epoch-proving-job-data.js';
import { TopTreeJob, type TopTreeJobHooks, type TopTreeProof } from './top-tree-job.js';

export type { EpochProvingJobState };

/**
 * Hooks the test harness can install to observe or interpose around the top-tree prove
 * call without monkey-patching internal classes. Forwarded to each `TopTreeJob` the
 * finalize loop constructs.
 */
export type EpochProvingJobHooks = {
  /** Called immediately before `topTree.prove(...)` is invoked. */
  beforeTopTreeProve?: () => Promise<void> | void;
  /** Called after `topTree.prove(...)` returns successfully (not on failure). */
  afterTopTreeProve?: () => Promise<void> | void;
  /**
   * If set, called instead of `topTree.prove(...)`. Receives a thunk that runs the
   * real call. Lets tests substitute a synthetic proof or delay/throw without
   * re-implementing the rest of the finalize flow.
   */
  topTreeProveOverride?: (defaultProve: () => Promise<TopTreeProof>) => Promise<TopTreeProof>;
};

export type EpochProvingJobOptions = {
  parallelBlockLimit?: number;
  skipSubmitProof?: boolean;
  /**
   * If set, the job sleeps this many ms after `completeEpoch` and before constructing
   * the first `TopTreeJob`. Lets late-arriving events (e.g. an L1 reorg's prune) be
   * processed before finalization runs.
   */
  finalizationDelayMs?: number;
};

/**
 * Orchestrates the proving of an epoch as a collection of self-contained jobs:
 *
 *   - One `CheckpointJob` per registered checkpoint, keyed by `(checkpoint number, slot)`
 *     so that a stale orphan and its re-org replacement coexist briefly without colliding.
 *   - One `TopTreeJob` per finalize attempt. A `removeCheckpoint` that lands while the
 *     top tree is in flight cancels it; the loop builds a fresh `TopTreeJob` from the
 *     surviving snapshot.
 *
 * The job's responsibility is to wire the registry and drive the finalize loop;
 * everything sub-tree- or top-tree-specific lives on the respective job classes.
 *
 * Cancellation is fire-and-forget — `removeCheckpoint` returns synchronously after
 * marking the matching jobs cancelled, kicking off background teardown. Each job's
 * `whenDone()` promise is collected so the EpochProvingJob can await all in-flight
 * work at `stop()`.
 */
export class EpochProvingJob implements Traceable {
  private state: EpochProvingJobState = 'initialized';
  private log: Logger;
  private uuid: string;

  private runPromise: Promise<void> | undefined;
  private deadlineTimeoutHandler: NodeJS.Timeout | undefined;

  /** Live checkpoint jobs, keyed by `${number}:${slot}`. */
  private readonly checkpointJobs: Map<string, CheckpointJob> = new Map();
  /** Cancelled jobs whose teardown is still in flight. Awaited at job stop. */
  private readonly pendingCleanups: CheckpointJob[] = [];
  /** Cancelled top-tree jobs whose teardown is still in flight. Awaited at job stop. */
  private readonly pendingTopTreeCleanups: TopTreeJob[] = [];
  /** The current top-tree attempt — replaced on every restart-loop iteration. */
  private topTreeJob: TopTreeJob | undefined;

  private epochComplete = false;
  private finalizationScheduled = false;

  /**
   * Snapshot of proving data captured just before `teardownAllOrchestrators` clears
   * the live checkpoint map. Allows the prover-node's failure-upload helper to read
   * the per-checkpoint txs / l1ToL2 messages / previous-block-header after the job
   * has reached a terminal state.
   */
  private provingDataSnapshot: EpochProvingJobData | undefined;

  private readonly completionPromise: Promise<EpochProvingJobState>;
  private resolveCompletion!: (state: EpochProvingJobState) => void;

  private readonly epochContext: EpochProvingContext;
  private readonly proverId: EthAddress;
  private readonly checkpointJobDeps: CheckpointJobDeps;

  public readonly tracer: Tracer;

  constructor(
    private readonly epochNumber: EpochNumber,
    dbProvider: Pick<ForkMerkleTreeOperations, 'fork'>,
    private readonly prover: EpochProverFactory,
    publicProcessorFactory: PublicProcessorFactory,
    private readonly publisher: Pick<ProverNodePublisher, 'submitEpochProof' | 'analyzeEpochProofSubmission'>,
    private readonly metrics: ProverNodeJobMetrics,
    private readonly deadline: Date | undefined,
    private readonly config: EpochProvingJobOptions,
    bindings?: LoggerBindings,
    private readonly hooks?: EpochProvingJobHooks,
  ) {
    this.uuid = crypto.randomUUID();
    this.log = createLogger('prover-node:epoch-proving-job', {
      ...bindings,
      instanceId: `epoch-${epochNumber}`,
    });
    this.tracer = metrics.tracer;
    this.proverId = prover.getProverId();
    this.epochContext = prover.createEpochProvingContext(epochNumber);

    this.checkpointJobDeps = {
      proverFactory: prover,
      epochContext: this.epochContext,
      publicProcessorFactory,
      dbProvider,
      proverId: this.proverId,
      metrics,
      deadline,
      log: this.log,
    };

    this.completionPromise = new Promise<EpochProvingJobState>(resolve => {
      this.resolveCompletion = resolve;
    });

    this.state = 'processing';
    this.scheduleDeadlineStop();

    this.log.info(`Created EpochProvingJob for epoch ${epochNumber}`, {
      epochNumber,
      uuid: this.uuid,
      deadline: this.deadline?.toISOString(),
      proverId: this.proverId.toString(),
    });
  }

  public getId(): string {
    return this.uuid;
  }

  public getState(): EpochProvingJobState {
    return this.state;
  }

  public getEpochNumber(): EpochNumber {
    return this.epochNumber;
  }

  public getDeadline(): Date | undefined {
    return this.deadline;
  }

  /** Total number of registered (live, uncancelled) checkpoint jobs. */
  public getCheckpointCount(): number {
    return this.checkpointJobs.size;
  }

  /** Sorted list of every live checkpoint number — for test/observability use. */
  public getCheckpointNumbers(): CheckpointNumber[] {
    return this.liveJobsSorted().map(j => CheckpointNumber(j.checkpoint.number));
  }

  /** True if the job has any live entry for this checkpoint number. */
  public hasCheckpoint(checkpointNumber: CheckpointNumber): boolean {
    for (const job of this.checkpointJobs.values()) {
      if (job.checkpoint.number === checkpointNumber) {
        return true;
      }
    }
    return false;
  }

  public isEpochComplete(): boolean {
    return this.epochComplete;
  }

  /**
   * Signals that the epoch is complete on L1 — no more new checkpoints will be produced.
   * Existing jobs may still be cancelled by a re-org. Idempotent.
   */
  public completeEpoch(): void {
    if (this.epochComplete) {
      return;
    }
    this.epochComplete = true;
    this.log.info(`Epoch ${this.epochNumber} marked complete on L1`, {
      epochNumber: this.epochNumber,
      uuid: this.uuid,
      checkpointCount: this.checkpointJobs.size,
    });
    this.checkStartFinalization();
  }

  /** Resolves when the job reaches a terminal state (completed, failed, timed-out, stopped). */
  public whenComplete(): Promise<EpochProvingJobState> {
    return this.completionPromise;
  }

  /**
   * Returns the accumulated proving data for failure upload. After teardown the
   * pre-cleared snapshot is returned; before teardown the live state is sampled.
   * Throws if no checkpoint ever reached `isCompleted` (nothing useful to upload).
   */
  public getProvingData(): EpochProvingJobData {
    return this.provingDataSnapshot ?? this.buildProvingDataSnapshot();
  }

  private buildProvingDataSnapshot(): EpochProvingJobData {
    const completedJobs = this.liveJobsSorted().filter(j => j.isCompleted());
    if (completedJobs.length === 0) {
      throw new Error(`No completed checkpoints to build proving data for epoch ${this.epochNumber}`);
    }
    const txs = new Map<string, Tx>();
    const l1ToL2Messages: Record<number, Fr[]> = {};
    for (const job of completedJobs) {
      for (const [hash, tx] of job.txs) {
        txs.set(hash, tx);
      }
      l1ToL2Messages[job.checkpoint.number] = job.l1ToL2Messages;
    }
    return {
      epochNumber: this.epochNumber,
      checkpoints: completedJobs.map(j => j.checkpoint),
      txs,
      l1ToL2Messages,
      previousBlockHeader: completedJobs[0].previousBlockHeader,
      attestations: [],
    };
  }

  /**
   * Registers a new checkpoint job. The caller supplies all register-time data — the
   * top tree can begin pipelined proving as soon as `completeEpoch` fires, regardless
   * of whether the matching txs have been gathered yet.
   *
   * Returns the abort signal owned by this job; the caller's tx-gathering task should
   * watch it and bail out early on cancel.
   */
  public registerCheckpoint(
    checkpoint: Checkpoint,
    checkpointIndex: number,
    attestations: CommitteeAttestation[],
    previousBlockHeader: BlockHeader,
    l1ToL2Messages: Fr[],
    previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ): AbortSignal {
    this.checkState();
    const id = CheckpointJob.idFor(checkpoint);
    if (this.checkpointJobs.has(id)) {
      throw new Error(`Checkpoint ${id} is already registered with the job`);
    }
    const job = new CheckpointJob(
      { checkpoint, checkpointIndex, attestations, previousBlockHeader, l1ToL2Messages, previousArchiveSiblingPath },
      this.checkpointJobDeps,
    );
    this.checkpointJobs.set(id, job);
    this.log.info(`Registered checkpoint ${checkpoint.number} with epoch ${this.epochNumber}`, {
      epochNumber: this.epochNumber,
      uuid: this.uuid,
      checkpointNumber: checkpoint.number,
      checkpointIndex,
      slotNumber: checkpoint.header.slotNumber,
      liveCheckpointCount: this.checkpointJobs.size,
    });
    return job.getAbortSignal();
  }

  /**
   * Hand transactions to the matching checkpoint job. No-op if the job was cancelled
   * while txs were being gathered. The call returns once block-level enqueue is done;
   * sub-tree proving continues asynchronously.
   */
  @trackSpan('EpochProvingJob.provideTxs', function (_cp: Checkpoint) {
    return { [Attributes.EPOCH_NUMBER]: this.epochNumber };
  })
  public async provideTxs(checkpoint: Checkpoint, txs: Map<string, Tx>): Promise<void> {
    this.checkState();
    const job = this.checkpointJobs.get(CheckpointJob.idFor(checkpoint));
    if (!job || job.isCancelled()) {
      // Job removed while txs were being gathered; the gather caller's signal already fired.
      this.log.debug(`Dropping provideTxs for checkpoint ${checkpoint.number}: job not registered or cancelled`, {
        epochNumber: this.epochNumber,
        checkpointNumber: checkpoint.number,
      });
      return;
    }
    try {
      await job.provideTxs(txs);
    } finally {
      // A successful provideTxs may have been the last piece of work the finalize
      // loop was waiting on (e.g. completeEpoch fired earlier).
      this.checkStartFinalization();
    }
  }

  /**
   * Removes every live job with `checkpoint.number > thresholdCheckpointNumber`. Used by
   * the prune path to drop everything above the surviving prefix in one call. Returns
   * the number of jobs removed.
   *
   * Performed atomically: every matching job is cancelled and removed before the top
   * tree is cancelled and finalization is re-triggered. Suffix-only removal keeps the
   * surviving set contiguous, so the finalize loop's restart always rebuilds against a
   * valid snapshot.
   */
  public removeCheckpointsAfter(thresholdCheckpointNumber: CheckpointNumber): number {
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return 0;
    }
    const removedNumbers = new Set<number>();
    for (const [id, job] of this.checkpointJobs) {
      if (job.checkpoint.number > thresholdCheckpointNumber) {
        job.cancel();
        this.pendingCleanups.push(job);
        this.checkpointJobs.delete(id);
        removedNumbers.add(job.checkpoint.number);
      }
    }
    if (removedNumbers.size === 0) {
      return 0;
    }

    const removed = [...removedNumbers];
    this.log.info(`Removed ${removedNumbers.size} checkpoints from epoch ${this.epochNumber}`, {
      epochNumber: this.epochNumber,
      thresholdCheckpointNumber,
      removedNumbers: removed,
    });

    if (this.topTreeJob && !this.topTreeJob.isCancelled()) {
      if (this.topTreeJob.snapshot.some(j => removedNumbers.has(j.checkpoint.number))) {
        this.log.warn(`Cancelling top-tree mid-flight; finalize will restart with surviving checkpoints`, {
          epochNumber: this.epochNumber,
          thresholdCheckpointNumber,
          removedNumbers: removed,
        });
        this.topTreeJob.cancel();
      }
    }

    this.checkStartFinalization();
    return removedNumbers.size;
  }

  /**
   * Internal: starts finalization if the epoch is marked complete and at least one
   * checkpoint is registered. Idempotent.
   */
  private checkStartFinalization() {
    if (!this.epochComplete || this.finalizationScheduled) {
      return;
    }
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return;
    }
    if (this.checkpointJobs.size === 0) {
      return;
    }
    this.finalizationScheduled = true;
    void this.runFinalization();
  }

  private async runFinalization(): Promise<void> {
    const delayMs = this.config.finalizationDelayMs;
    if (delayMs && delayMs > 0) {
      this.log.warn(`Waiting ${delayMs}ms before finalising epoch ${this.epochNumber}`);
      await sleep(delayMs);
      if (EpochProvingJobTerminalState.includes(this.state)) {
        this.resolveCompletion(this.state);
        return;
      }
    }
    try {
      await this.finalizeAndProve();
    } catch (err) {
      this.log.error(`Unexpected error during finalization`, err);
    } finally {
      this.resolveCompletion(this.state);
    }
  }

  /**
   * Finalize loop: build a `TopTreeJob` from the live snapshot, await its result.
   * On `TopTreeCancelledError`, snapshot again and rebuild. On terminal failure
   * (zero survivors, deadline, etc.), mark the epoch failed.
   */
  @trackSpan('EpochProvingJob.finalizeAndProve', function () {
    return { [Attributes.EPOCH_NUMBER]: this.epochNumber };
  })
  public async finalizeAndProve() {
    this.checkState();
    const timer = new Timer();

    this.log.info(`Finalizing epoch ${this.epochNumber} with ${this.checkpointJobs.size} checkpoints`, {
      epochNumber: this.epochNumber,
      uuid: this.uuid,
    });

    const { promise, resolve } = promiseWithResolvers<void>();
    this.runPromise = promise;

    try {
      let attempt = 0;
      while (true) {
        attempt++;
        this.checkState();

        const snapshot = this.liveJobsSorted();
        if (snapshot.length === 0) {
          throw new Error(`Cannot finalize epoch ${this.epochNumber}: no surviving checkpoints`);
        }

        const topTreeJob = new TopTreeJob(this.epochNumber, snapshot, {
          proverFactory: this.prover,
          metrics: this.metrics,
          log: this.log,
          hooks: this.toTopTreeHooks(),
        });
        this.topTreeJob = topTreeJob;
        const { fromCheckpoint, toCheckpoint, count } = topTreeJob.getRange();

        if (attempt > 1) {
          this.log.warn(`Restarting top-tree prove with surviving checkpoints`, {
            epochNumber: this.epochNumber,
            attempt,
            fromCheckpoint,
            toCheckpoint,
            checkpointCount: count,
            uuid: this.uuid,
          });
        }

        this.progressState('awaiting-prover');
        let proof: TopTreeProof;
        try {
          proof = await topTreeJob.start();
        } catch (err) {
          if (err instanceof TopTreeCancelledError) {
            this.log.info(`Top-tree cancelled by removeCheckpoint; will restart`, {
              epochNumber: this.epochNumber,
              uuid: this.uuid,
            });
            this.topTreeJob = undefined;
            // Cancel already kicked off the underlying orchestrator teardown; collect
            // the job here so the next attempt can start immediately while teardown
            // completes in the background.
            this.pendingTopTreeCleanups.push(topTreeJob);
            continue;
          }
          throw err;
        }
        this.topTreeJob = undefined;

        this.log.info(`Finalized proof for epoch ${this.epochNumber}`, {
          epochNumber: this.epochNumber,
          uuid: this.uuid,
          duration: timer.ms(),
        });

        this.progressState('publishing-proof');
        await this.publishProof(snapshot, proof, fromCheckpoint, toCheckpoint, count, timer);
        return;
      }
    } catch (err: any) {
      if (err && err.name === 'HaltExecutionError') {
        this.log.warn(`Halted execution of epoch ${this.epochNumber} prover job`, {
          uuid: this.uuid,
          epochNumber: this.epochNumber,
          details: err.message,
        });
        return;
      }
      this.log.error(`Error finalizing epoch ${this.epochNumber} prover job`, err, {
        uuid: this.uuid,
        epochNumber: this.epochNumber,
      });
      if (this.state === 'processing' || this.state === 'awaiting-prover' || this.state === 'publishing-proof') {
        this.state = 'failed';
      }
    } finally {
      clearTimeout(this.deadlineTimeoutHandler);
      await this.teardownAllOrchestrators();
      resolve();
    }
  }

  private async publishProof(
    snapshot: CheckpointJob[],
    proof: TopTreeProof,
    fromCheckpointNumber: number,
    toCheckpointNumber: number,
    checkpointCount: number,
    timer: Timer,
  ) {
    const fromCheckpoint = CheckpointNumber(fromCheckpointNumber);
    const toCheckpoint = CheckpointNumber(toCheckpointNumber);
    // Attestations come from the highest-numbered registered job — that's the one
    // whose attestations the L1 contract checks for the proven range.
    const attestations = snapshot.at(-1)!.attestations.map(a => a.toViem());
    const epochSizeBlocks = snapshot.reduce((acc, j) => acc + j.checkpoint.blocks.length, 0);
    const epochSizeTxs = snapshot.reduce(
      (acc, j) => acc + j.checkpoint.blocks.reduce((bAcc, block) => bAcc + block.body.txEffects.length, 0),
      0,
    );

    if (this.config.skipSubmitProof) {
      this.log.info(`Proof publishing is disabled. Analyzing estimated L1 fees for epoch ${this.epochNumber}`);
      try {
        await this.publisher.analyzeEpochProofSubmission({
          fromCheckpoint,
          toCheckpoint,
          epochNumber: this.epochNumber,
          publicInputs: proof.publicInputs,
          proof: proof.proof,
          batchedBlobInputs: proof.batchedBlobInputs,
          attestations,
        });
      } catch (err) {
        this.log.warn(`Failed to analyze estimated L1 fees for epoch ${this.epochNumber}`, err);
      }
      this.state = 'completed';
      this.metrics.recordProvingJob(timer.ms(), timer.ms(), checkpointCount, epochSizeBlocks, epochSizeTxs);
      return;
    }

    const success = await this.publisher.submitEpochProof({
      fromCheckpoint,
      toCheckpoint,
      epochNumber: this.epochNumber,
      publicInputs: proof.publicInputs,
      proof: proof.proof,
      batchedBlobInputs: proof.batchedBlobInputs,
      attestations,
    });
    if (!success) {
      throw new Error('Failed to submit epoch proof to L1');
    }

    this.log.info(`Submitted proof for epoch ${this.epochNumber} (checkpoints ${fromCheckpoint} to ${toCheckpoint})`, {
      epochNumber: this.epochNumber,
      uuid: this.uuid,
    });
    this.state = 'completed';
    this.metrics.recordProvingJob(timer.ms(), timer.ms(), checkpointCount, epochSizeBlocks, epochSizeTxs);
  }

  /**
   * Stops every checkpoint job, the top tree job (if started), and the per-epoch
   * chonk-verifier cache. The shared broker facade is owned by the prover-client
   * and outlives every job, so it is not stopped here.
   */
  private async teardownAllOrchestrators() {
    // Capture proving data *before* we clear the live job map, so a failure-upload
    // attempt that runs after teardown still has the per-checkpoint txs / messages /
    // previous-block-header to work with.
    if (!this.provingDataSnapshot) {
      try {
        this.provingDataSnapshot = this.buildProvingDataSnapshot();
      } catch {
        // No completed checkpoints — failure-upload will have nothing to upload, which
        // is fine. Snapshot stays undefined and getProvingData will rebuild and rethrow.
      }
    }

    // If the epoch finished proving normally, the per-checkpoint cancels are routine
    // teardown; otherwise they're real aborts (reorg, deadline, error). Forward the
    // distinction so CheckpointJob's log reflects the actual situation.
    const routine = this.state === 'completed';
    for (const job of this.checkpointJobs.values()) {
      job.cancel({ routine });
      this.pendingCleanups.push(job);
    }
    this.checkpointJobs.clear();

    if (this.topTreeJob) {
      this.topTreeJob.cancel();
      this.pendingTopTreeCleanups.push(this.topTreeJob);
      this.topTreeJob = undefined;
    }

    await Promise.allSettled([
      ...this.pendingCleanups.map(j => j.whenDone()),
      ...this.pendingTopTreeCleanups.map(j => j.whenDone()),
    ]);
    this.pendingCleanups.length = 0;
    this.pendingTopTreeCleanups.length = 0;

    this.epochContext.stop();
  }

  public async stop(state: EpochProvingJobState = 'stopped') {
    this.state = state;
    await this.teardownAllOrchestrators();
    if (this.runPromise) {
      await this.runPromise;
    }
    // Resolve completion in case finalization never started.
    this.resolveCompletion(this.state);
  }

  /** Cancels the job. Equivalent to stop('stopped'). */
  public async cancel() {
    await this.stop('stopped');
  }

  private scheduleDeadlineStop() {
    const deadline = this.deadline;
    if (deadline) {
      const timeout = deadline.getTime() - Date.now();
      if (timeout <= 0) {
        throw new Error('Cannot start job with deadline in the past');
      }

      this.deadlineTimeoutHandler = setTimeout(() => {
        if (EpochProvingJobTerminalState.includes(this.state)) {
          return;
        }
        this.log.warn('Stopping job due to deadline hit', { uuid: this.uuid, epochNumber: this.epochNumber });
        this.stop('timed-out').catch(err => {
          this.log.error('Error stopping job', err, { uuid: this.uuid, epochNumber: this.epochNumber });
        });
      }, timeout);
    }
  }

  private progressState(state: EpochProvingJobState) {
    this.checkState();
    this.state = state;
  }

  private checkState() {
    if (this.state === 'timed-out' || this.state === 'stopped' || this.state === 'failed' || this.state === 'reorg') {
      throw new HaltExecutionError(this.state);
    }
  }

  /** Snapshot of live (registered, uncancelled) jobs in checkpoint-number order. */
  private liveJobsSorted(): CheckpointJob[] {
    return Array.from(this.checkpointJobs.values()).sort((a, b) => a.checkpoint.number - b.checkpoint.number);
  }

  private toTopTreeHooks(): TopTreeJobHooks | undefined {
    if (!this.hooks) {
      return undefined;
    }
    const { beforeTopTreeProve, afterTopTreeProve, topTreeProveOverride } = this.hooks;
    if (!beforeTopTreeProve && !afterTopTreeProve && !topTreeProveOverride) {
      return undefined;
    }
    return {
      beforeProve: beforeTopTreeProve,
      afterProve: afterTopTreeProve,
      proveOverride: topTreeProveOverride,
    };
  }
}

class HaltExecutionError extends Error {
  constructor(public readonly state: EpochProvingJobState) {
    super(`Halted execution due to state ${state}`);
    this.name = 'HaltExecutionError';
  }
}
