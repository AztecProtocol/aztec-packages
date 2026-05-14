import type { BatchedBlob, BatchedBlobAccumulator, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { NESTED_RECURSIVE_PROOF_LENGTH, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import {
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  RootRollupPrivateInputs,
  type RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';

import { toProofData } from './block-building-helpers.js';
import type { ProofState } from './block-proving-state.js';

enum TOP_TREE_LIFECYCLE {
  CREATED,
  RESOLVED,
  REJECTED,
}

/**
 * Lean top-tree-only state. Owns the merge tree of checkpoint root proofs, the
 * single-checkpoint padding proof slot, the final root rollup proof, and the blob
 * accumulator endpoints needed to finalise the epoch's batched blob proof.
 *
 * Constructed with `totalNumCheckpoints` and `finalBlobBatchingChallenges` upfront —
 * by the time the top tree starts, all checkpoints are known and the challenges are
 * derivable from their blob fields.
 */
export class TopTreeProvingState {
  private checkpointProofs: UnbalancedTreeStore<
    ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;
  private checkpointPaddingProof:
    | ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private rootRollupProof: ProofState<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined;
  private endBlobAccumulator: BatchedBlobAccumulator | undefined;
  private finalBatchedBlob: BatchedBlob | undefined;
  private lifecycle = TOP_TREE_LIFECYCLE.CREATED;

  constructor(
    public readonly epochNumber: EpochNumber,
    public readonly totalNumCheckpoints: number,
    public readonly finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    public readonly startBlobAccumulator: BatchedBlobAccumulator,
    private readonly completionCallback: () => void,
    private readonly rejectionCallback: (reason: string) => void,
  ) {
    if (totalNumCheckpoints < 1) {
      throw new Error(`TopTreeProvingState requires at least one checkpoint; got ${totalNumCheckpoints}.`);
    }
    this.checkpointProofs = new UnbalancedTreeStore(totalNumCheckpoints);
  }

  // --- checkpoint root rollup ---

  public setCheckpointRootRollupProof(
    checkpointIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    return this.checkpointProofs.setLeaf(checkpointIndex, { provingOutput });
  }

  // --- checkpoint merge rollup ---

  public tryStartProvingCheckpointMerge(location: TreeNodeLocation) {
    if (this.checkpointProofs.getNode(location)?.isProving) {
      return false;
    }
    this.checkpointProofs.setNode(location, { isProving: true });
    return true;
  }

  public setCheckpointMergeRollupProof(
    location: TreeNodeLocation,
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.checkpointProofs.setNode(location, { provingOutput });
  }

  public isReadyForCheckpointMerge(location: TreeNodeLocation) {
    return !!this.checkpointProofs.getSibling(location)?.provingOutput;
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.checkpointProofs.getParentLocation(location);
  }

  public getCheckpointMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.checkpointProofs.getChildren(mergeLocation).map(c => c?.provingOutput);
    if (!left || !right) {
      throw new Error('At least one child is not ready for the checkpoint merge rollup.');
    }
    return new CheckpointMergeRollupPrivateInputs([toProofData(left), toProofData(right)]);
  }

  // --- padding (single-checkpoint case) ---

  public tryStartProvingPaddingCheckpoint() {
    if (this.checkpointPaddingProof?.isProving) {
      return false;
    }
    this.checkpointPaddingProof = { isProving: true };
    return true;
  }

  public setCheckpointPaddingProof(
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.checkpointPaddingProof = { provingOutput };
  }

  public getPaddingCheckpointInputs() {
    return new CheckpointPaddingRollupPrivateInputs();
  }

  // --- root rollup ---

  public tryStartProvingRootRollup() {
    if (this.rootRollupProof?.isProving) {
      return false;
    }
    this.rootRollupProof = { isProving: true };
    return true;
  }

  public setRootRollupProof(provingOutput: PublicInputsAndRecursiveProof<RootRollupPublicInputs>) {
    this.rootRollupProof = { provingOutput };
  }

  public isReadyForRootRollup() {
    const childProofs = this.#getChildProofsForRoot();
    return childProofs.every(p => !!p);
  }

  public getRootRollupInputs() {
    const [left, right] = this.#getChildProofsForRoot();
    if (!left || !right) {
      throw new Error('At least one child is not ready for the root rollup.');
    }
    return RootRollupPrivateInputs.from({
      previousRollups: [toProofData(left), toProofData(right)],
    });
  }

  // --- blob accumulator finalisation ---

  /**
   * Sets the end-of-epoch blob accumulator, computed by the top-tree orchestrator
   * from the surviving checkpoints' blob fields. Required before `finalizeBatchedBlob`.
   */
  public setEndBlobAccumulator(accumulator: BatchedBlobAccumulator) {
    this.endBlobAccumulator = accumulator;
  }

  public async finalizeBatchedBlob() {
    if (!this.endBlobAccumulator) {
      throw new Error('End blob accumulator not set; call setEndBlobAccumulator before finalize.');
    }
    this.finalBatchedBlob = await this.endBlobAccumulator.finalize(true /* verifyProof */);
  }

  public getEpochProofResult(): { proof: Proof; publicInputs: RootRollupPublicInputs; batchedBlobInputs: BatchedBlob } {
    const provingOutput = this.rootRollupProof?.provingOutput;
    if (!provingOutput || !this.finalBatchedBlob) {
      throw new Error('Top-tree proof not ready; root rollup or batched blob missing.');
    }
    return {
      proof: provingOutput.proof.binaryProof,
      publicInputs: provingOutput.inputs,
      batchedBlobInputs: this.finalBatchedBlob,
    };
  }

  // --- lifecycle ---

  public verifyState() {
    return this.lifecycle === TOP_TREE_LIFECYCLE.CREATED;
  }

  public resolve() {
    if (!this.verifyState()) {
      return;
    }
    this.lifecycle = TOP_TREE_LIFECYCLE.RESOLVED;
    this.completionCallback();
  }

  public reject(reason: string) {
    if (!this.verifyState()) {
      return;
    }
    this.lifecycle = TOP_TREE_LIFECYCLE.REJECTED;
    this.rejectionCallback(reason);
  }

  public cancel() {
    this.reject('Top-tree proving cancelled');
  }

  #getChildProofsForRoot() {
    const rootLocation = { level: 0, index: 0 };
    return this.totalNumCheckpoints === 1
      ? [this.checkpointProofs.getNode(rootLocation)?.provingOutput, this.checkpointPaddingProof?.provingOutput]
      : this.checkpointProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }
}
