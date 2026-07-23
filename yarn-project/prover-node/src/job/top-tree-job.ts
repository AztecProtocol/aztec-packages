import type { BatchedBlob } from '@aztec/blob-lib/types';
import type { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { Timer } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import { buildFinalBlobChallenges } from '@aztec/prover-client/helpers';
import {
  type CheckpointTopTreeData,
  TopTreeCancelledError,
  type TopTreeOrchestrator,
} from '@aztec/prover-client/orchestrator';
import type { Proof } from '@aztec/stdlib/proofs';
import type { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import type { ProverNodeJobMetrics } from '../metrics.js';
import type { CheckpointProver } from './checkpoint-prover.js';

/** Result of a successful top-tree run. */
export type TopTreeProof = {
  publicInputs: RootRollupPublicInputs;
  proof: Proof;
  batchedBlobInputs: BatchedBlob;
};

/**
 * Hooks for tests to interpose around the underlying `topTree.prove(...)` call without
 * monkey-patching the orchestrator.
 */
export type TopTreeJobHooks = {
  /** Called immediately before the top tree's `prove` runs. */
  beforeProve?: () => Promise<void> | void;
  /** Called after `prove` returns successfully (not on failure / cancellation). */
  afterProve?: () => Promise<void> | void;
  /**
   * If set, called instead of running the underlying prove. Receives a thunk that
   * runs the real call. Lets tests substitute a synthetic proof or delay/throw without
   * re-implementing the rest of the finalize flow.
   */
  proveOverride?: (defaultProve: () => Promise<TopTreeProof>) => Promise<TopTreeProof>;
};

/**
 * Self-contained top-tree job. Constructed from a snapshot of `CheckpointProver`s; runs
 * `topTree.prove(...)` against their pending `blockProofs` promises and exposes the
 * final epoch proof via `result`.
 *
 */
export class TopTreeJob {
  /** Resolves with the final proof on success; rejects on cancellation or any prove error. */
  readonly result: PromiseWithResolvers<TopTreeProof> = promiseWithResolvers();

  /** Snapshot of checkpoint jobs the top tree is built from, in checkpoint-number order. */
  readonly snapshot: readonly CheckpointProver[];

  private readonly topTree: TopTreeOrchestrator;
  private readonly fromCheckpoint: CheckpointNumber;
  private readonly toCheckpoint: CheckpointNumber;
  private cancelled = false;
  /** Tracks the cancel-driven background teardown so `whenDone()` can await it. */
  private cancelPromise?: Promise<void>;
  private readonly executionTimer = new Timer();

  constructor(
    private readonly epochNumber: EpochNumber,
    snapshot: readonly CheckpointProver[],
    private readonly deps: {
      proverFactory: EpochProverFactory;
      metrics: ProverNodeJobMetrics;
      log: Logger;
      hooks?: TopTreeJobHooks;
    },
  ) {
    if (snapshot.length === 0) {
      throw new Error(`Cannot construct TopTreeJob for epoch ${epochNumber}: empty snapshot`);
    }
    for (let i = 1; i < snapshot.length; i++) {
      const prev = snapshot[i - 1].checkpoint.number;
      const curr = snapshot[i].checkpoint.number;
      if (curr !== prev + 1) {
        throw new Error(
          `Cannot construct TopTreeJob for epoch ${epochNumber}: checkpoint numbers must be contiguous, got gap between ${prev} and ${curr}`,
        );
      }
    }
    this.snapshot = snapshot;
    this.fromCheckpoint = snapshot[0].checkpoint.number;
    this.toCheckpoint = snapshot[snapshot.length - 1].checkpoint.number;
    this.topTree = deps.proverFactory.createTopTreeOrchestrator();
    deps.log.info(
      `Created TopTreeJob for epoch ${epochNumber} covering checkpoints ${this.fromCheckpoint}..${this.toCheckpoint}`,
      {
        epochNumber,
        fromCheckpoint: this.fromCheckpoint,
        toCheckpoint: this.toCheckpoint,
        checkpointCount: snapshot.length,
      },
    );
    // Mark the result's rejection branch as observed so a cancellation before any
    // consumer awaits does not surface as unhandled.
    this.result.promise.catch(() => {});
  }

  /** Range covered by this attempt — useful for logging and L1 submission. */
  public getRange(): { fromCheckpoint: CheckpointNumber; toCheckpoint: CheckpointNumber; count: number } {
    return { fromCheckpoint: this.fromCheckpoint, toCheckpoint: this.toCheckpoint, count: this.snapshot.length };
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  /** Wall-time since construction — used by the owning job for metrics. */
  public elapsedMs(): number {
    return this.executionTimer.ms();
  }

  /** Kicks off the prove. Returns the result promise (also available as `result.promise`). */
  public start(): Promise<TopTreeProof> {
    void this.run();
    return this.result.promise;
  }

  /**
   * Cancels the in-flight prove. Idempotent. Rejects the result promise with
   * `TopTreeCancelledError`, then kicks off the underlying orchestrator's teardown
   * in the background so callers don't block on it. The teardown promise is exposed
   * via `whenDone()` — the parent collects the cancelled job and awaits all
   * pending top-tree teardowns at the end of the epoch.
   */
  public cancel(abortJobs = true): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.deps.log.info(
      `Cancelling TopTreeJob for epoch ${this.epochNumber} (checkpoints ${this.fromCheckpoint}..${this.toCheckpoint})`,
      {
        epochNumber: this.epochNumber,
        fromCheckpoint: this.fromCheckpoint,
        toCheckpoint: this.toCheckpoint,
        elapsedMs: this.executionTimer.ms(),
      },
    );
    this.result.reject(new TopTreeCancelledError());
    // Fire and forget: parent awaits the cancel-driven teardown via whenDone(); the
    // chained .catch swallows rejections so the unawaited promise doesn't surface
    // as an unhandled rejection.
    this.cancelPromise = this.runCancel(abortJobs).catch(() => {});
  }

  /** Resolves once the cancel-driven teardown of the underlying orchestrator has unwound. */
  public async whenDone(): Promise<void> {
    if (this.cancelPromise) {
      await this.cancelPromise;
    }
  }

  private async runCancel(abortJobs: boolean): Promise<void> {
    try {
      this.topTree.cancel({ abortJobs });
    } catch (err) {
      this.deps.log.error('Error cancelling top tree', err);
    }
    try {
      await this.topTree.stop();
    } catch (err) {
      this.deps.log.error('Error stopping top tree', err);
    }
  }

  private async run() {
    try {
      const blobTimer = new Timer();
      const blobFieldsPerCheckpoint = this.snapshot.map(j => j.checkpoint.toBlobFields());
      const finalBlobBatchingChallenges = await buildFinalBlobChallenges(blobFieldsPerCheckpoint);
      this.deps.metrics.recordBlobProcessing(blobTimer.ms());
      this.deps.log.verbose(
        `Built final blob batching challenges for epoch ${this.epochNumber} in ${blobTimer.ms()}ms`,
        {
          epochNumber: this.epochNumber,
          checkpointCount: this.snapshot.length,
          durationMs: blobTimer.ms(),
        },
      );

      const checkpointData: CheckpointTopTreeData[] = this.snapshot.map(j => ({
        blockProofs: j.whenBlockProofsReady(),
        l2ToL1MsgsPerBlock: j.checkpoint.blocks.map(b => b.body.txEffects.map(tx => tx.l2ToL1Msgs)),
        blobFields: j.checkpoint.toBlobFields(),
        previousBlockHeader: j.previousBlockHeader,
        previousArchiveSiblingPath: j.previousArchiveSiblingPath,
      }));

      const defaultProve = (): Promise<TopTreeProof> =>
        this.topTree.prove(this.epochNumber, this.snapshot.length, finalBlobBatchingChallenges, checkpointData);

      await this.deps.hooks?.beforeProve?.();
      const proveTimer = new Timer();
      this.deps.log.info(
        `Starting top-tree prove for epoch ${this.epochNumber} (checkpoints ${this.fromCheckpoint}..${this.toCheckpoint})`,
        {
          epochNumber: this.epochNumber,
          fromCheckpoint: this.fromCheckpoint,
          toCheckpoint: this.toCheckpoint,
          checkpointCount: this.snapshot.length,
        },
      );
      const proof = await (this.deps.hooks?.proveOverride
        ? this.deps.hooks.proveOverride(defaultProve)
        : defaultProve());
      await this.deps.hooks?.afterProve?.();
      this.deps.log.info(`Top-tree prove succeeded for epoch ${this.epochNumber} in ${proveTimer.ms()}ms`, {
        epochNumber: this.epochNumber,
        fromCheckpoint: this.fromCheckpoint,
        toCheckpoint: this.toCheckpoint,
        durationMs: proveTimer.ms(),
        totalElapsedMs: this.executionTimer.ms(),
      });

      this.result.resolve(proof);
    } catch (err) {
      // Cancel paths surface as TopTreeCancelledError; everything else propagates as-is.
      this.result.reject(err);
    }
  }
}
