import { BatchedBlob, BatchedBlobAccumulator, type FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  type L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  OUT_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import {
  MerkleTreeCalculator,
  type TreeNodeLocation,
  UnbalancedTreeStore,
  shaMerkleHash,
} from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import {
  CheckpointConstantData,
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  PublicChonkVerifierPublicInputs,
  RootRollupPrivateInputs,
  type RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot, type MerkleTreeId } from '@aztec/stdlib/trees';
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
  private checkpointProofs:
    | UnbalancedTreeStore<ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>
    | undefined;
  private checkpointPaddingProof:
    | ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private rootRollupProof: ProofState<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined;
  private checkpoints: (CheckpointProvingState | undefined)[] = [];
  private startBlobAccumulator: BatchedBlobAccumulator | undefined;
  private endBlobAccumulator: BatchedBlobAccumulator | undefined;
  private finalBatchedBlob: BatchedBlob | undefined;
  private provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED;

  /** Set after `finalizeEpochStructure` is called. */
  private _totalNumCheckpoints: number | undefined;
  /** Set after `finalizeEpochStructure` is called. */
  private _finalBlobBatchingChallenges: FinalBlobBatchingChallenges | undefined;

  // Map from tx hash to chonk verifier proof promise. Used when kickstarting chonk verifier proofs before tx processing.
  public readonly cachedChonkVerifierProofs = new Map<
    string,
    Promise<
      PublicInputsAndRecursiveProof<PublicChonkVerifierPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    >
  >();

  constructor(
    public readonly epochNumber: EpochNumber,
    private onCheckpointBlobAccumulatorSet: (checkpoint: CheckpointProvingState) => Promise<void>,
    private completionCallback: (result: ProvingResult) => void,
    private rejectionCallback: (reason: string) => void,
  ) {}

  /** Returns the total number of checkpoints, or undefined if not yet finalized. */
  public get totalNumCheckpoints(): number | undefined {
    return this._totalNumCheckpoints;
  }

  /** Returns whether the epoch structure has been finalized. */
  public get isEpochStructureFinalized(): boolean {
    return this.totalNumCheckpoints != undefined;
  }

  /**
   * Finalizes the epoch structure after all checkpoints have been added.
   * Sets the final checkpoint count and blob batching challenges, creates the
   * UnbalancedTreeStore for checkpoint merges, and triggers checkpoint root
   * enqueue for any checkpoints whose block merge proofs are already complete.
   */
  public async finalizeEpochStructure(
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ) {
    if (this.isEpochStructureFinalized) {
      // Idempotent: if called again with the same values, just return.
      if (
        this._totalNumCheckpoints === totalNumCheckpoints &&
        this._finalBlobBatchingChallenges?.equals(finalBlobBatchingChallenges)
      ) {
        return;
      }
      throw new Error('Epoch structure has already been finalized with different values.');
    }

    this._totalNumCheckpoints = totalNumCheckpoints;
    this._finalBlobBatchingChallenges = finalBlobBatchingChallenges;
    this.checkpointProofs = new UnbalancedTreeStore(totalNumCheckpoints);
    this.startBlobAccumulator = BatchedBlobAccumulator.newWithChallenges(finalBlobBatchingChallenges);

    // Transition to FULL if all checkpoints are added.
    if (this.checkpoints.filter(c => !!c).length === totalNumCheckpoints) {
      this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL;
    }

    // Set blob batching challenges on all existing checkpoints.
    for (const checkpoint of this.checkpoints) {
      if (checkpoint) {
        checkpoint.setFinalBlobBatchingChallenges(finalBlobBatchingChallenges);
      }
    }

    // Accumulate out hashes and blob data now that structure is known.
    await this.accumulateCheckpointOutHashes();
    await this.setBlobAccumulators();

    // For any checkpoints whose block merge proofs are already complete, trigger checkpoint root enqueue.
    for (const checkpoint of this.checkpoints) {
      if (checkpoint && checkpoint.isReadyForCheckpointRoot()) {
        await this.onCheckpointBlobAccumulatorSet(checkpoint);
      }
    }
  }

  // Adds a checkpoint to the proving state.
  // Will update the proving life cycle if this is the last checkpoint (only when epoch structure is finalized).
  public startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    totalNumBlocks: number,
    previousBlockHeader: BlockHeader,
    lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    l1ToL2Messages: Fr[],
    lastL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    lastL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
    newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    newL1ToL2MessageSubtreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH>,
  ): CheckpointProvingState {
    if (this._totalNumCheckpoints !== undefined && checkpointIndex >= this._totalNumCheckpoints) {
      throw new Error(
        `Unable to start a new checkpoint at index ${checkpointIndex}. Expected at most ${this._totalNumCheckpoints} checkpoints.`,
      );
    }

    const checkpoint = new CheckpointProvingState(
      checkpointIndex,
      constants,
      totalNumBlocks,
      this._finalBlobBatchingChallenges,
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

    if (
      this._totalNumCheckpoints !== undefined &&
      this.checkpoints.filter(c => !!c).length === this._totalNumCheckpoints
    ) {
      this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL;
    }

    return checkpoint;
  }

  public getCheckpointProvingState(index: number) {
    return this.checkpoints[index];
  }

  public getCheckpointProvingStateByBlockNumber(blockNumber: BlockNumber) {
    return this.checkpoints.find(
      c =>
        c &&
        Number(blockNumber) >= Number(c.firstBlockNumber) &&
        Number(blockNumber) < Number(c.firstBlockNumber) + c.totalNumBlocks,
    );
  }

  public getBlockProvingStateByBlockNumber(blockNumber: BlockNumber) {
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
    // Before finalization, always accept checkpoints.
    if (this._totalNumCheckpoints === undefined) {
      return true;
    }
    return this.checkpoints.filter(c => !!c).length < this._totalNumCheckpoints;
  }

  public setCheckpointRootRollupProof(
    checkpointIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    if (!this.checkpointProofs) {
      throw new Error('Checkpoint proofs store not initialized. Call finalizeEpochStructure first.');
    }
    return this.checkpointProofs.setLeaf(checkpointIndex, { provingOutput });
  }

  public tryStartProvingCheckpointMerge(location: TreeNodeLocation) {
    if (!this.checkpointProofs) {
      throw new Error('Checkpoint proofs store not initialized. Call finalizeEpochStructure first.');
    }
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
    if (!this.checkpointProofs) {
      throw new Error('Checkpoint proofs store not initialized. Call finalizeEpochStructure first.');
    }
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

  public async accumulateCheckpointOutHashes() {
    if (this._totalNumCheckpoints === undefined) {
      return;
    }

    const treeCalculator = await MerkleTreeCalculator.create(OUT_HASH_TREE_HEIGHT, undefined, (left, right) =>
      Promise.resolve(shaMerkleHash(left, right)),
    );

    const computeOutHashHint = async (leaves: Fr[]) => {
      const tree = await treeCalculator.computeTree(leaves.map(l => l.toBuffer()));
      const nextAvailableLeafIndex = leaves.length;
      return {
        treeSnapshot: new AppendOnlyTreeSnapshot(Fr.fromBuffer(tree.root), nextAvailableLeafIndex),
        siblingPath: tree.getSiblingPath(nextAvailableLeafIndex).map(Fr.fromBuffer) as Tuple<
          Fr,
          typeof OUT_HASH_TREE_HEIGHT
        >,
      };
    };

    let hint = this.checkpoints[0]?.getOutHashHint();
    const outHashes = [];
    const activeCheckpoints = this.checkpoints.filter(c => !!c) as CheckpointProvingState[];
    for (let i = 0; i < activeCheckpoints.length; i++) {
      const checkpoint = activeCheckpoints[i];

      // If hints are not set yet, it must be the first checkpoint. Compute the hints with an empty tree.
      hint ??= await computeOutHashHint([]);
      checkpoint.setOutHashHint(hint);

      // Get the out hash for this checkpoint.
      const outHash = checkpoint.accumulateBlockOutHashes();
      if (!outHash) {
        break;
      }
      outHashes.push(outHash);

      // If this is NOT the last checkpoint, get or create the hint for the next checkpoint.
      if (i !== activeCheckpoints.length - 1) {
        hint = checkpoint.getOutHashHintForNextCheckpoint() ?? (await computeOutHashHint(outHashes));
        checkpoint.setOutHashHintForNextCheckpoint(hint);
      }
    }
  }

  public async setBlobAccumulators() {
    if (!this.startBlobAccumulator || this._totalNumCheckpoints === undefined) {
      return;
    }

    let previousAccumulator = this.startBlobAccumulator;
    // Accumulate blobs as far as we can for this epoch.
    const activeCheckpoints = this.checkpoints.filter(c => !!c) as CheckpointProvingState[];
    for (let i = 0; i < activeCheckpoints.length; i++) {
      const checkpoint = activeCheckpoints[i];

      const endAccumulator =
        checkpoint.getEndBlobAccumulator() || (await checkpoint.accumulateBlobs(previousAccumulator));
      if (!endAccumulator) {
        break;
      }

      previousAccumulator = endAccumulator;

      // If this is the last checkpoint, set the end blob accumulator.
      if (i === activeCheckpoints.length - 1) {
        this.endBlobAccumulator = endAccumulator;
      }
    }
  }

  public async finalizeBatchedBlob() {
    if (!this.endBlobAccumulator) {
      throw new Error('End blob accumulator not ready.');
    }
    this.finalBatchedBlob = await this.endBlobAccumulator.finalize(true /* verifyProof */);
  }

  public getParentLocation(location: TreeNodeLocation) {
    if (!this.checkpointProofs) {
      throw new Error('Checkpoint proofs store not initialized. Call finalizeEpochStructure first.');
    }
    return this.checkpointProofs.getParentLocation(location);
  }

  public getCheckpointMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    if (!this.checkpointProofs) {
      throw new Error('Checkpoint proofs store not initialized. Call finalizeEpochStructure first.');
    }
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
    if (!this.checkpointProofs) {
      return false;
    }
    return !!this.checkpointProofs.getSibling(location)?.provingOutput;
  }

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForRootRollup() {
    if (!this.checkpointProofs || !this.isEpochStructureFinalized) {
      return false;
    }
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
    if (!this.checkpointProofs || this._totalNumCheckpoints === undefined) {
      return [undefined, undefined];
    }
    const rootLocation = { level: 0, index: 0 };
    // If there's only 1 checkpoint, its checkpoint root proof will be stored at the root.
    return this._totalNumCheckpoints === 1
      ? [this.checkpointProofs.getNode(rootLocation)?.provingOutput, this.checkpointPaddingProof?.provingOutput]
      : this.checkpointProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }
}
