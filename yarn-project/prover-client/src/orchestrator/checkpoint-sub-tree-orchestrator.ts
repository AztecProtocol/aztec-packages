import { FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { ARCHIVE_HEIGHT, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
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
import type {
  BlockRollupPublicInputs,
  CheckpointConstantData,
  PublicChonkVerifierPublicInputs,
} from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { getPublicChonkVerifierPrivateInputsFromTx } from './block-building-helpers.js';
import type { BlockProvingState } from './block-proving-state.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import type { EpochProvingContext } from './epoch-proving-context.js';
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
 * Wiring: a single-checkpoint epoch is created in the constructor (epoch number sourced
 * from the supplied `EpochProvingContext`). The canonical way to obtain a fully-started
 * sub-tree is the `start` static factory, which also drives the single internal
 * `startNewCheckpoint(0, ...)` call. The sub-tree never calls `finalizeEpochStructure`;
 * the override of `checkAndEnqueueCheckpointRootRollup` resolves `getSubTreeResult` once
 * block-level proving completes.
 */
export class CheckpointSubTreeOrchestrator extends ProvingOrchestrator {
  private readonly subTreeResult: PromiseWithResolvers<SubTreeResult>;

  constructor(
    dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    prover: ServerCircuitProver,
    proverId: EthAddress,
    /**
     * Per-epoch shared chonk-verifier proof cache. Every chonk-verifier proof started
     * by this sub-tree lives on the context and survives the sub-tree's cancellation,
     * so a tx whose original checkpoint is reorged out and re-appears in a replacement
     * checkpoint reuses the cached proof. The context's `epochNumber` is the epoch
     * this sub-tree proves into.
     */
    private readonly epochContext: EpochProvingContext,
    cancelJobsOnStop: boolean = false,
    enqueueConcurrency: number,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(dbProvider, prover, proverId, cancelJobsOnStop, enqueueConcurrency, telemetryClient, bindings);

    // Single-checkpoint mini-epoch by construction. The total/challenges supplied to
    // `super.startNewEpoch` are never read, because the sub-tree overrides
    // `checkAndEnqueueCheckpointRootRollup` to short-circuit before the parent's
    // checkpoint-root / finalize machinery would consume them.
    super.startNewEpoch(epochContext.epochNumber, 1, FinalBlobBatchingChallenges.empty());

    this.subTreeResult = promiseWithResolvers<SubTreeResult>();
    // Mark the rejection branch as observed so a `cancel()` or proving failure does not
    // surface an unhandled rejection when no consumer awaits getSubTreeResult().
    this.subTreeResult.promise.catch(() => {});

    // If the parent's proving state ever rejects, surface the failure on the sub-tree promise.
    void this.provingPromise!.then(result => {
      if (result.status === 'failure') {
        this.subTreeResult.reject(new Error(result.reason));
      }
    });
  }

  /**
   * Constructs and starts a sub-tree for a single checkpoint. The returned sub-tree
   * has had its single internal `startNewCheckpoint(0, ...)` driven; callers proceed
   * directly to per-block `startNewBlock` / `addTxs` / `setBlockCompleted`.
   *
   * If the internal `startNewCheckpoint` rejects, the partially-constructed sub-tree
   * is stopped before the error propagates, so no broker resources leak.
   */
  public static async start(
    dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    prover: ServerCircuitProver,
    proverId: EthAddress,
    epochContext: EpochProvingContext,
    cancelJobsOnStop: boolean,
    enqueueConcurrency: number,
    checkpointConstants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlocks: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ): Promise<CheckpointSubTreeOrchestrator> {
    const subTree = new CheckpointSubTreeOrchestrator(
      dbProvider,
      prover,
      proverId,
      epochContext,
      cancelJobsOnStop,
      enqueueConcurrency,
      telemetryClient,
      bindings,
    );
    try {
      await ProvingOrchestrator.prototype.startNewCheckpoint.call(
        subTree,
        0,
        checkpointConstants,
        l1ToL2Messages,
        totalNumBlocks,
        headerOfLastBlockInPreviousCheckpoint,
      );
      return subTree;
    } catch (err) {
      await subTree.stop().catch(() => {});
      throw err;
    }
  }

  /** Returns a promise that resolves when block-level proving completes for the checkpoint. */
  public getSubTreeResult(): Promise<SubTreeResult> {
    return this.subTreeResult.promise;
  }

  /**
   * The epoch is started in the constructor.
   */
  public override startNewEpoch(
    _epochNumber: EpochNumber,
    _totalNumCheckpoints: number,
    _finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ): void {
    throw new Error('CheckpointSubTreeOrchestrator starts its epoch in the constructor; do not call startNewEpoch.');
  }

  /**
   * The single internal checkpoint is started by the `start` factory
   */
  public override startNewCheckpoint(
    _checkpointIndex: number,
    _constants: CheckpointConstantData,
    _l1ToL2Messages: Fr[],
    _totalNumBlocks: number,
    _headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<void> {
    return Promise.reject(
      new Error(
        'CheckpointSubTreeOrchestrator drives its single checkpoint in `start`; do not call startNewCheckpoint.',
      ),
    );
  }

  /**
   * Returns the archive sibling path captured at the internal `startNewCheckpoint`.
   * Available synchronously once `start` has resolved, before block-level proving
   * completes. The top-tree consumer uses this to assemble checkpoint root rollup hints
   * up-front so checkpoint root proofs can pipeline against in-flight sub-tree proving.
   */
  public getPreviousArchiveSiblingPath(): Tuple<Fr, typeof ARCHIVE_HEIGHT> {
    const checkpoint = this.provingState!.getCheckpointProvingState(0);
    if (!checkpoint) {
      throw new Error('Checkpoint not started; call CheckpointSubTreeOrchestrator.start first.');
    }
    return checkpoint.getLastArchiveSiblingPath();
  }

  /**
   * Override the checkpoint-root boundary: instead of escalating to checkpoint root,
   * resolve the sub-tree promise with the block-level proof outputs once they're all ready.
   */
  // eslint-disable-next-line require-await
  protected override async checkAndEnqueueCheckpointRootRollup(provingState: CheckpointProvingState): Promise<void> {
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

  /**
   * Kickstart chonk-verifier circuits via the shared `EpochProvingContext`. The context
   * owns the broker job lifecycle, so the proof survives this sub-tree's `cancel()` —
   * a tx that ends up in a replacement checkpoint after a reorg can pick the cached
   * promise up and skip re-proving.
   */
  public override startChonkVerifierCircuits(txs: Tx[]): Promise<void> {
    if (!this.provingState?.verifyState()) {
      return Promise.reject(new Error('Sub-tree proving state is not active.'));
    }
    const publicTxs = txs.filter(tx => tx.data.forPublic);
    for (const tx of publicTxs) {
      const txHash = tx.getTxHash().toString();
      const inputs = getPublicChonkVerifierPrivateInputsFromTx(tx, this.getProverId().toField());
      // Fire and forget — getOrEnqueueChonkVerifier later picks up the cached promise
      // when the tx is processed inside its block.
      void this.epochContext.enqueue(txHash, inputs);
    }
    return Promise.resolve();
  }

  /**
   * Route the tx's chonk-verifier dependency through the per-epoch context: read the
   * cached promise (or enqueue if missing), then `.then(handleResult)` to progress to
   * the base rollup once the proof lands.
   */
  protected override getOrEnqueueChonkVerifier(provingState: BlockProvingState, txIndex: number) {
    if (!provingState.verifyState()) {
      return;
    }

    const txProvingState = provingState.getTxProvingState(txIndex);
    const txHash = txProvingState.processedTx.hash.toString();

    const handleResult = (
      result: PublicInputsAndRecursiveProof<
        PublicChonkVerifierPublicInputs,
        typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
      >,
    ) => {
      if (!provingState.verifyState()) {
        return;
      }
      txProvingState.setPublicChonkVerifierProof(result);
      this.checkAndEnqueueBaseRollup(provingState, txIndex);
    };

    let promise = this.epochContext.getCached(txHash);
    if (!promise) {
      promise = this.epochContext.enqueue(txHash, txProvingState.getPublicChonkVerifierPrivateInputs());
    }
    void promise.then(handleResult).catch(() => {
      // The context self-cleans on rejection; a future call (replacement sub-tree
      // for this tx) will see the miss and re-enqueue. No action needed here.
    });
  }
}
