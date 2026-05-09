import type { BatchedBlob } from '@aztec/blob-lib/types';
import type { EpochNumber } from '@aztec/foundation/branded-types';
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
import type { CheckpointJob } from './checkpoint-job.js';

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
 * Self-contained top-tree job. Constructed from a snapshot of `CheckpointJob`s; runs
 * `topTree.prove(...)` against their pending `blockProofs` promises and exposes the
 * final epoch proof via `result`.
 *
 * Cancellation rejects `result` with `TopTreeCancelledError`; the owning
 * `EpochProvingJob` snapshots the surviving checkpoint set and constructs a fresh
 * `TopTreeJob`. This makes the restart loop a sequence of distinct top-tree jobs
 * rather than re-using one.
 */
export class TopTreeJob {
  /** Resolves with the final proof on success; rejects on cancellation or any prove error. */
  readonly result: PromiseWithResolvers<TopTreeProof> = promiseWithResolvers();

  /** Snapshot of checkpoint jobs the top tree is built from, in checkpoint-number order. */
  readonly snapshot: readonly CheckpointJob[];

  private readonly topTree: TopTreeOrchestrator;
  private readonly fromCheckpoint: number;
  private readonly toCheckpoint: number;
  private cancelled = false;
  private readonly executionTimer = new Timer();

  constructor(
    private readonly epochNumber: EpochNumber,
    snapshot: readonly CheckpointJob[],
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
    this.snapshot = snapshot;
    this.fromCheckpoint = snapshot[0].checkpoint.number;
    this.toCheckpoint = snapshot[snapshot.length - 1].checkpoint.number;
    this.topTree = deps.proverFactory.createTopTreeOrchestrator();
    // Mark the result's rejection branch as observed so a cancellation before any
    // consumer awaits does not surface as unhandled.
    this.result.promise.catch(() => {});
  }

  /** Range covered by this attempt — useful for logging and L1 submission. */
  public getRange(): { fromCheckpoint: number; toCheckpoint: number; count: number } {
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
   * Cancels the in-flight prove. Idempotent. The result promise will reject with
   * `TopTreeCancelledError` either via the cancellation-aware orchestrator or via
   * this method directly (covers the case where cancel lands before `start`).
   */
  public cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    try {
      this.topTree.cancel({ abortJobs: true });
    } catch (err) {
      this.deps.log.error('Error cancelling top tree', err);
    }
    this.result.reject(new TopTreeCancelledError());
  }

  /** Tears down the underlying orchestrator. Safe to call after `cancel()`. */
  public async stop(): Promise<void> {
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

      const checkpointData: CheckpointTopTreeData[] = this.snapshot.map(j => ({
        blockProofs: j.blockProofs.promise,
        l2ToL1MsgsPerBlock: j.checkpoint.blocks.map(b => b.body.txEffects.map(tx => tx.l2ToL1Msgs)),
        blobFields: j.checkpoint.toBlobFields(),
        previousBlockHeader: j.previousBlockHeader,
        previousArchiveSiblingPath: j.previousArchiveSiblingPath,
      }));

      const defaultProve = (): Promise<TopTreeProof> =>
        this.topTree.prove(this.epochNumber, this.snapshot.length, finalBlobBatchingChallenges, checkpointData);

      await this.deps.hooks?.beforeProve?.();
      const proof = await (this.deps.hooks?.proveOverride
        ? this.deps.hooks.proveOverride(defaultProve)
        : defaultProve());
      await this.deps.hooks?.afterProve?.();

      this.result.resolve(proof);
    } catch (err) {
      // Cancel paths surface as TopTreeCancelledError; everything else propagates as-is.
      this.result.reject(err);
    }
  }
}
