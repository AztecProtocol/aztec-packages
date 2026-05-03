import type { FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { ARCHIVE_HEIGHT, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import type { Tuple } from '@aztec/foundation/serialize';
import type { EthAddress } from '@aztec/stdlib/block';
import type {
  ForkMerkleTreeOperations,
  PublicInputsAndRecursiveProof,
  ReadonlyWorldStateAccess,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import type { BlockRollupPublicInputs, CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { BlockHeader } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import { ProvingOrchestrator } from './orchestrator.js';

/**
 * Result of proving a single checkpoint's block-level sub-tree.
 *
 * Contains the final block-rollup proof outputs that feed the checkpoint root rollup,
 * plus the archive sibling path captured before any block in the checkpoint landed
 * (the top-tree needs this to assemble the checkpoint root rollup hints).
 */
export type SubTreeResult = {
  blockProofOutputs: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >[];
  previousArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>;
};

/**
 * Orchestrates block-level proving for a single checkpoint, stopping at the boundary
 * where checkpoint root rollup would otherwise begin.
 *
 * Reuses every circuit driver in `ProvingOrchestrator` (chonk verifier, base, merge,
 * block-root, parity, block-merge) but overrides the gating method that escalates to
 * checkpoint root rollup. Instead of escalating, the orchestrator resolves
 * `getSubTreeResult()` once every block-level proof in the checkpoint's tree is ready.
 *
 * Wiring: a single-checkpoint epoch is created internally. Callers drive it the same
 * way as a multi-checkpoint epoch — `startNewEpoch`, `startNewCheckpoint`, then per
 * block `startNewBlock` / `addTxs` / `setBlockCompleted`. The sub-tree never calls
 * `finalizeEpochStructure`; the override fires once block-level proving completes.
 */
export class CheckpointSubTreeOrchestrator extends ProvingOrchestrator {
  private subTreeResult: PromiseWithResolvers<SubTreeResult> | undefined;

  constructor(
    dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    prover: ServerCircuitProver,
    proverId: EthAddress,
    cancelJobsOnStop: boolean = false,
    enqueueConcurrency: number,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(dbProvider, prover, proverId, cancelJobsOnStop, enqueueConcurrency, telemetryClient, bindings);
  }

  /** Returns a promise that resolves when block-level proving completes for the checkpoint. */
  public getSubTreeResult(): Promise<SubTreeResult> {
    if (!this.subTreeResult) {
      throw new Error('Sub-tree result requested before startNewEpoch.');
    }
    return this.subTreeResult.promise;
  }

  public override startNewEpoch(epochNumber: EpochNumber): void {
    super.startNewEpoch(epochNumber);
    this.subTreeResult = promiseWithResolvers<SubTreeResult>();
    // Mark the rejection branch as observed so a `cancel()` or proving failure does not
    // surface an unhandled rejection when no consumer awaits getSubTreeResult().
    this.subTreeResult.promise.catch(() => {});

    // If the parent's proving state ever rejects, surface the failure on the sub-tree promise.
    void this.provingPromise!.then(result => {
      if (result.status === 'failure') {
        this.subTreeResult!.reject(new Error(result.reason));
      }
    });
  }

  /**
   * The sub-tree must never escalate to checkpoint root rollup. Calling
   * `finalizeEpochStructure` is a programmer error — the boundary is `getSubTreeResult`.
   */
  public override finalizeEpochStructure(
    _totalNumCheckpoints: number,
    _finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ): Promise<void> {
    return Promise.reject(
      new Error('CheckpointSubTreeOrchestrator does not support finalizeEpochStructure; use getSubTreeResult instead.'),
    );
  }

  /**
   * Single-checkpoint by construction. The sub-tree's parent epoch state is created in
   * `startNewEpoch`; callers must use checkpoint index 0.
   */
  public override startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<void> {
    if (checkpointIndex !== 0) {
      return Promise.reject(
        new Error(
          `CheckpointSubTreeOrchestrator only supports a single checkpoint at index 0; got ${checkpointIndex}.`,
        ),
      );
    }
    return super.startNewCheckpoint(
      checkpointIndex,
      constants,
      l1ToL2Messages,
      totalNumBlocks,
      headerOfLastBlockInPreviousCheckpoint,
    );
  }

  /**
   * Returns the archive sibling path captured at `startNewCheckpoint`. Available
   * synchronously once `startNewCheckpoint` has resolved, before block-level proving
   * completes. The top-tree consumer uses this to assemble checkpoint root rollup hints
   * up-front so checkpoint root proofs can pipeline against in-flight sub-tree proving.
   */
  public getPreviousArchiveSiblingPath(): Tuple<Fr, typeof ARCHIVE_HEIGHT> {
    if (!this.provingState) {
      throw new Error('Sub-tree state not initialised; call startNewEpoch first.');
    }
    const checkpoint = this.provingState.getCheckpointProvingState(0);
    if (!checkpoint) {
      throw new Error('Checkpoint not started; call startNewCheckpoint first.');
    }
    return checkpoint.getLastArchiveSiblingPath();
  }

  /**
   * Override the checkpoint-root boundary: instead of escalating to checkpoint root,
   * resolve the sub-tree promise with the block-level proof outputs once they're all ready.
   */
  // eslint-disable-next-line require-await
  protected override async checkAndEnqueueCheckpointRootRollup(provingState: CheckpointProvingState): Promise<void> {
    if (!this.subTreeResult) {
      // startNewEpoch hasn't run — nothing to resolve. The parent's invariants will catch this.
      return;
    }

    const proofs = provingState.getSubTreeOutputProofs();
    const nonEmpty = proofs.filter((p): p is NonNullable<typeof p> => !!p);
    if (proofs.length !== nonEmpty.length) {
      // Block merge tree not fully resolved yet — will be retried as more block proofs land.
      return;
    }

    this.subTreeResult.resolve({
      blockProofOutputs: nonEmpty,
      previousArchiveSiblingPath: provingState.getLastArchiveSiblingPath(),
    });
  }
}
