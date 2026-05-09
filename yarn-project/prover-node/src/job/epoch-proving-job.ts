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
import {
  type BlockExecutionWatchers,
  type CheckpointSubTreeOrchestrator,
  type EpochProvingContext,
  TopTreeCancelledError,
} from '@aztec/prover-client/orchestrator';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import type { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import { BlockExecutionInputs } from '@aztec/stdlib/block_execution';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import {
  type EpochProvingJobState,
  EpochProvingJobTerminalState,
  type ForkMerkleTreeOperations,
  makeExecutionResultJobId,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
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
  /** The current top-tree attempt — replaced on every restart-loop iteration. */
  private topTreeJob: TopTreeJob | undefined;

  private epochComplete = false;
  private finalizationScheduled = false;
  private finalizationStarted = false;

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
    this.epochComplete = true;
    this.checkStartFinalization();
  }

  /** Resolves when the job reaches a terminal state (completed, failed, timed-out, stopped). */
  public whenComplete(): Promise<EpochProvingJobState> {
    return this.completionPromise;
  }

  /** Returns the accumulated proving data for failure upload. */
  public getProvingData(): EpochProvingJobData {
    const completedJobs = this.liveJobsSorted().filter(j => j.isCompleted());
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
      previousBlockHeader: completedJobs[0]!.previousBlockHeader,
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
   * Removes every live job with the given checkpoint number. Idempotent — a second
   * call with the same number is a no-op. Identity is `(number, slot)`, so a fresh
   * registration at the same number after a remove gets a separate job that this
   * call will not affect.
   *
   * Fire-and-forget: synchronously marks each matching job cancelled and queues their
   * teardown for awaiting at `stop()`. If the in-flight `TopTreeJob` includes any of
   * the removed jobs in its snapshot, it is cancelled too — the finalize loop catches
   * `TopTreeCancelledError` and constructs a fresh `TopTreeJob` from the surviving set.
   *
   * Returns true if any live job was removed.
   */
  public removeCheckpoint(checkpointNumber: CheckpointNumber): boolean {
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return false;
    }
    const removed: CheckpointJob[] = [];
    for (const [id, job] of this.checkpointJobs) {
      if (job.checkpoint.number === checkpointNumber) {
        job.cancel();
        this.pendingCleanups.push(job);
        this.checkpointJobs.delete(id);
        removed.push(job);
      }
    }
    if (removed.length === 0) {
      return false;
    }

    this.log.info(`Removed checkpoint ${checkpointNumber} from epoch ${this.epochNumber}`, {
      epochNumber: this.epochNumber,
      checkpointNumber,
      removedJobs: removed.length,
    });

    if (this.topTreeJob && !this.topTreeJob.isCancelled()) {
      const topTreeUsesRemoved = this.topTreeJob.snapshot.some(j => j.checkpoint.number === checkpointNumber);
      if (topTreeUsesRemoved) {
        this.log.warn(`Cancelling top-tree mid-flight; finalize will restart with surviving checkpoints`, {
          epochNumber: this.epochNumber,
          removedCheckpoint: checkpointNumber,
        });
        this.topTreeJob.cancel();
      }
    }

    this.checkStartFinalization();
    return true;
  }

  /**
   * Removes every live job with `checkpoint.number > thresholdCheckpointNumber`. Used by
   * the prune path to drop everything above the surviving prefix in one call. Returns
   * the number of jobs removed.
   */
  public removeCheckpointsAfter(thresholdCheckpointNumber: CheckpointNumber): number {
    if (EpochProvingJobTerminalState.includes(this.state)) {
      return 0;
    }
    const numbersToRemove = new Set<CheckpointNumber>();
    for (const job of this.checkpointJobs.values()) {
      if (job.checkpoint.number > thresholdCheckpointNumber) {
        numbersToRemove.add(CheckpointNumber(job.checkpoint.number));
      }
    }
    let removed = 0;
    for (const n of numbersToRemove) {
      if (this.removeCheckpoint(n)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Cancels every live job that has not yet been provided txs. Used by `startProof` to
   * drop in-flight gather tasks queued by a parallel L2BlockStream-driven path so that
   * `completeEpoch` can finalize against the synchronously-loaded set instead.
   */
  public cancelPendingCheckpoints(): void {
    const toCancel = new Set<CheckpointNumber>();
    for (const job of this.checkpointJobs.values()) {
      if (!job.isCompleted()) {
        toCancel.add(CheckpointNumber(job.checkpoint.number));
      }
    }
    for (const n of toCancel) {
      this.removeCheckpoint(n);
    }
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
    this.finalizationStarted = true;
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
            await topTreeJob.stop();
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
    for (const job of this.checkpointJobs.values()) {
      job.cancel();
      this.pendingCleanups.push(job);
    }
    this.checkpointJobs.clear();

    if (this.topTreeJob) {
      this.topTreeJob.cancel();
      try {
        await this.topTreeJob.stop();
      } catch (err) {
        this.log.error('Error stopping top tree', err);
      }
      this.topTreeJob = undefined;
    }

    await Promise.allSettled(this.pendingCleanups.map(j => j.whenDone()));
    this.pendingCleanups.length = 0;

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

  /**
   * Dispatches the block as a `BLOCK_EXECUTION` job and wires up the orchestrator's
   * deterministic-ID watchers for the per-tx proving jobs the agent will enqueue
   * (`PRIVATE_TX_BASE_ROLLUP` for private-only txs, `PUBLIC_VM` carrying the
   * `BlockExecutionTxData` passenger for public txs). Once the agent reports
   * `BLOCK_EXECUTION` complete, applies the per-block summary to the orchestrator.
   *
   * Replaces the legacy in-prover-node `publicProcessor.process` + `addTxs` flow.
   */
  private async dispatchOffloadedBlock(
    subTree: CheckpointSubTreeOrchestrator,
    block: L2Block,
    blockIndex: number,
    l1ToL2Messages: Fr[],
    blockTxs: Tx[],
    signal: AbortSignal,
  ): Promise<void> {
    const facade = this.prover.getBrokerCircuitProverFacade();
    const blockNumber = block.header.getBlockNumber();
    const slotNumber = block.header.getSlot();

    // Watchers must be registered before the agent enqueues per-tx jobs so the broker's
    // completion notifications are not lost.
    const watchers: BlockExecutionWatchers = {
      expectPrivateBaseRollupProofForTx: (txIndex, abortSignal) => {
        const id = makeExecutionResultJobId(
          this.epochNumber,
          blockNumber,
          slotNumber,
          txIndex,
          ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
        );
        return facade.expectJob(id, ProvingRequestType.PRIVATE_TX_BASE_ROLLUP, abortSignal);
      },
      expectAvmProofForTx: (txIndex, abortSignal) => {
        const id = makeExecutionResultJobId(
          this.epochNumber,
          blockNumber,
          slotNumber,
          txIndex,
          ProvingRequestType.PUBLIC_VM,
        );
        return facade.expectJob(id, ProvingRequestType.PUBLIC_VM, abortSignal);
      },
    };
    await subTree.addBlockForExecution(blockNumber, blockTxs, watchers);
    if (signal.aborted) {
      return;
    }

    const startSpongeBlob = subTree.getBlockStartSpongeBlob(blockNumber);
    const inputs = new BlockExecutionInputs(
      this.epochNumber,
      0, // checkpointIndex within the sub-tree's single-checkpoint epoch — irrelevant to the agent's per-tx work
      block.header,
      block.body.txEffects.map(e => e.txHash),
      blockIndex === 0,
      l1ToL2Messages,
      startSpongeBlob,
    );

    const result = await facade.executeBlock(inputs, signal, this.epochNumber);
    if (signal.aborted) {
      return;
    }

    await subTree.applyBlockExecutionResult(blockNumber, result);
  }
}

class HaltExecutionError extends Error {
  constructor(public readonly state: EpochProvingJobState) {
    super(`Halted execution due to state ${state}`);
    this.name = 'HaltExecutionError';
  }
}
