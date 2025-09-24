import { BatchedBlob, BatchedBlobAccumulator, type FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import {
  CheckpointConstantData,
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  PublicTubePublicInputs,
  RootRollupPrivateInputs,
  type RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import type { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { toProofData } from './block-building-helpers.js';
import type { ProofState } from './block-proving-state.js';
import { CheckpointProvingState } from './checkpoint-proving-state.js';

export type TreeSnapshots = Map<MerkleTreeId, AppendOnlyTreeSnapshot>;

enum PROVING_STATE_LIFECYCLE {
  PROVING_STATE_CREATED,
  PROVING_STATE_FULL,
  PROVING_STATE_RESOLVED,
  PROVING_STATE_REJECTED,
}

export type ProvingResult = { status: 'success' } | { status: 'failure'; reason: string };

/**
 * The current state of the proving schedule for an epoch.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 * Carries an identifier so we can identify if the proving state is discarded and a new one started.
 * Captures resolve and reject callbacks to provide a promise base interface to the consumer of our proving.
 */
export class EpochProvingState {
  private checkpointProofs: UnbalancedTreeStore<
    ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;
  private checkpointPaddingProof:
    | ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private rootRollupProof: ProofState<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined;
  private checkpoints: (CheckpointProvingState | undefined)[] = [];
  private startBlobAccumulator: BatchedBlobAccumulator;
  private endBlobAccumulator: BatchedBlobAccumulator | undefined;
  private finalBatchedBlob: BatchedBlob | undefined;
  private provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED;

  // Map from tx hash to tube proof promise. Used when kickstarting tube proofs before tx processing.
  public readonly cachedTubeProofs = new Map<
    string,
    Promise<PublicInputsAndRecursiveProof<PublicTubePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>
  >();

  constructor(
    public readonly epochNumber: number,
    public readonly totalNumCheckpoints: number,
    private readonly finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    private onCheckpointBlobAccumulatorSet: (checkpoint: CheckpointProvingState) => void,
    private completionCallback: (result: ProvingResult) => void,
    private rejectionCallback: (reason: string) => void,
  ) {
    this.checkpointProofs = new UnbalancedTreeStore(totalNumCheckpoints);
    this.startBlobAccumulator = BatchedBlobAccumulator.newWithChallenges(finalBlobBatchingChallenges);
  }

  // Adds a block to the proving state, returns its index
  // Will update the proving life cycle if this is the last block
  public startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    totalNumBlocks: number,
    totalNumBlobFields: number,
    previousBlockHeader: BlockHeader,
    lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    l1ToL2Messages: Fr[],
    lastL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    lastL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
    newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    newL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
  ): CheckpointProvingState {
    if (checkpointIndex >= this.totalNumCheckpoints) {
      throw new Error(
        `Unable to start a new checkpoint at index ${checkpointIndex}. Expected at most ${this.totalNumCheckpoints} checkpoints.`,
      );
    }

    const checkpoint = new CheckpointProvingState(
      checkpointIndex,
      constants,
      totalNumBlocks,
      totalNumBlobFields,
      this.finalBlobBatchingChallenges,
      previousBlockHeader,
      lastArchiveSiblingPath,
      l1ToL2Messages,
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeRootSiblingPath,
      newL1ToL2MessageTreeSnapshot,
      newL1ToL2MessageSubtreeRootSiblingPath,
      this,
      this.onCheckpointBlobAccumulatorSet,
    );
    this.checkpoints[checkpointIndex] = checkpoint;

    if (this.checkpoints.filter(c => !!c).length === this.totalNumCheckpoints) {
      this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL;
    }

    return checkpoint;
  }

  public getCheckpointProvingState(index: number) {
    return this.checkpoints[index];
  }

  public getCheckpointProvingStateByBlockNumber(blockNumber: number) {
    return this.checkpoints.find(
      c => c && blockNumber >= c.firstBlockNumber && blockNumber < c.firstBlockNumber + c.totalNumBlocks,
    );
  }

  public getBlockProvingStateByBlockNumber(blockNumber: number) {
    return this.getCheckpointProvingStateByBlockNumber(blockNumber)?.getBlockProvingStateByBlockNumber(blockNumber);
  }

  // Returns true if this proving state is still valid, false otherwise
  public verifyState() {
    return (
      this.provingStateLifecycle === PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED ||
      this.provingStateLifecycle === PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL
    );
  }

  // Returns true if we are still able to accept checkpoints, false otherwise.
  public isAcceptingCheckpoints() {
    return this.checkpoints.filter(c => !!c).length < this.totalNumCheckpoints;
  }

  public setCheckpointRootRollupProof(
    checkpointIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    return this.checkpointProofs.setLeaf(checkpointIndex, { provingOutput });
  }

  public tryStartProvingCheckpointMerge(location: TreeNodeLocation) {
    if (this.checkpointProofs.getNode(location)?.isProving) {
      return false;
    } else {
      this.checkpointProofs.setNode(location, { isProving: true });
      return true;
    }
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

  public tryStartProvingRootRollup() {
    if (this.rootRollupProof?.isProving) {
      return false;
    } else {
      this.rootRollupProof = { isProving: true };
      return true;
    }
  }

  public setRootRollupProof(provingOutput: PublicInputsAndRecursiveProof<RootRollupPublicInputs>) {
    this.rootRollupProof = { provingOutput };
  }

  public tryStartProvingPaddingCheckpoint() {
    if (this.checkpointPaddingProof?.isProving) {
      return false;
    } else {
      this.checkpointPaddingProof = { isProving: true };
      return true;
    }
  }

  public setCheckpointPaddingProof(
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.checkpointPaddingProof = { provingOutput };
  }

  public async setBlobAccumulators() {
    let previousAccumulator = this.startBlobAccumulator;
    // Accumulate blobs as far as we can for this epoch.
    for (let i = 0; i < this.totalNumCheckpoints; i++) {
      const checkpoint = this.checkpoints[i];
      if (!checkpoint) {
        break;
      }

      const endAccumulator =
        checkpoint.getEndBlobAccumulator() || (await checkpoint.accumulateBlobs(previousAccumulator));
      if (!endAccumulator) {
        break;
      }

      previousAccumulator = endAccumulator;

      // If this is the last checkpoint, set the end blob accumulator.
      if (i === this.totalNumCheckpoints - 1) {
        this.endBlobAccumulator = endAccumulator;
      }
    }
  }

  public async finalizeBatchedBlob() {
    if (!this.endBlobAccumulator) {
      throw new Error('End blob accumulator not ready.');
    }
    this.finalBatchedBlob = await this.endBlobAccumulator.finalize();
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

  public getRootRollupInputs() {
    const [left, right] = this.#getChildProofsForRoot();
    if (!left || !right) {
      throw new Error('At least one child is not ready for the root rollup.');
    }

    return RootRollupPrivateInputs.from({
      previousRollups: [toProofData(left), toProofData(right)],
    });
  }

  public getPaddingCheckpointInputs() {
    return new CheckpointPaddingRollupPrivateInputs();
  }

  public getEpochProofResult(): { proof: Proof; publicInputs: RootRollupPublicInputs; batchedBlobInputs: BatchedBlob } {
    const provingOutput = this.rootRollupProof?.provingOutput;

    if (!provingOutput || !this.finalBatchedBlob) {
      throw new Error('Unable to get epoch proof result. Root rollup is not ready.');
    }

    return {
      proof: provingOutput.proof.binaryProof,
      publicInputs: provingOutput.inputs,
      batchedBlobInputs: this.finalBatchedBlob,
    };
  }

  public isReadyForCheckpointMerge(location: TreeNodeLocation) {
    return !!this.checkpointProofs.getSibling(location)?.provingOutput;
  }

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForRootRollup() {
    const childProofs = this.#getChildProofsForRoot();
    return childProofs.every(p => !!p);
  }

  // Attempts to reject the proving state promise with a reason of 'cancelled'
  public cancel() {
    this.reject('Proving cancelled');
  }

  // Attempts to reject the proving state promise with the given reason
  // Does nothing if not in a valid state
  public reject(reason: string) {
    if (!this.verifyState()) {
      return;
    }
    this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_REJECTED;
    this.rejectionCallback(reason);
  }

  // Attempts to resolve the proving state promise with the given result
  // Does nothing if not in a valid state
  public resolve(result: ProvingResult) {
    if (!this.verifyState()) {
      return;
    }
    this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_RESOLVED;
    this.completionCallback(result);
  }

  #getChildProofsForRoot() {
    const rootLocation = { level: 0, index: 0 };
    // If there's only 1 block, its block root proof will be stored at the root.
    return this.totalNumCheckpoints === 1
      ? [this.checkpointProofs.getNode(rootLocation)?.provingOutput, this.checkpointPaddingProof?.provingOutput]
      : this.checkpointProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }
}
