import {
  BatchedBlobAccumulator,
  BlobAccumulatorPublicInputs,
  type FinalBlobBatchingChallenges,
  SpongeBlob,
} from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  BLOBS_PER_BLOCK,
  FIELDS_PER_BLOB,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUM_MSGS_PER_BASE_PARITY,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { BLS12Point, Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { BaseParityInputs } from '@aztec/stdlib/parity';
import {
  BlockMergeRollupPrivateInputs,
  BlockRollupPublicInputs,
  CheckpointConstantData,
  CheckpointRollupPublicInputs,
  CheckpointRootRollupHints,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import type { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { accumulateBlobs, buildBlobHints, toRollupProofData } from './block-building-helpers.js';
import { BlockProvingState, type ProofState } from './block-proving-state.js';
import type { EpochProvingState } from './epoch-proving-state.js';

export class CheckpointProvingState {
  private blockProofs: UnbalancedTreeStore<
    ProofState<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;
  private checkpointRootProof:
    | ProofState<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private blocks: (BlockProvingState | undefined)[] = [];
  private startBlobAccumulator: BatchedBlobAccumulator | undefined;
  private endBlobAccumulator: BatchedBlobAccumulator | undefined;
  private error: string | undefined;
  public readonly firstBlockNumber: number;

  constructor(
    public readonly index: number,
    public readonly constants: CheckpointConstantData,
    public readonly totalNumBlocks: number,
    private readonly totalNumBlobFields: number,
    private readonly finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
    private readonly headerOfLastBlockInPreviousCheckpoint: BlockHeader,
    private readonly lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    private readonly l1ToL2Messages: Fr[],
    // The snapshot and sibling path before the new l1 to l2 message subtree is inserted.
    private readonly lastL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    // The snapshot and sibling path after the new l1 to l2 message subtree is inserted.
    private readonly newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly newL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    public parentEpoch: EpochProvingState,
  ) {
    this.blockProofs = new UnbalancedTreeStore(totalNumBlocks);
    this.firstBlockNumber = headerOfLastBlockInPreviousCheckpoint.globalVariables.blockNumber + 1;
  }

  public get epochNumber(): number {
    return this.parentEpoch.epochNumber;
  }

  public startNewBlock(
    blockNumber: number,
    timestamp: UInt64,
    totalNumTxs: number,
    lastArchiveTreeSnapshot: AppendOnlyTreeSnapshot,
    lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ): BlockProvingState {
    const index = blockNumber - this.firstBlockNumber;
    if (index >= this.totalNumBlocks) {
      throw new Error(`Unable to start a new block at index ${index}. Expected at most ${this.totalNumBlocks} blocks.`);
    }

    // If this is the first block, we use the snapshot and sibling path before the new l1 to l2 messages are inserted.
    // Otherwise, we use the snapshot and sibling path after the new l1 to l2 messages are inserted, which will always
    // happen in the first block.
    const lastL1ToL2MessageTreeSnapshot =
      index === 0 ? this.lastL1ToL2MessageTreeSnapshot : this.newL1ToL2MessageTreeSnapshot;
    const lastL1ToL2MessageSubtreeSiblingPath =
      index === 0 ? this.lastL1ToL2MessageSubtreeSiblingPath : this.newL1ToL2MessageSubtreeSiblingPath;

    const startSpongeBlob =
      index === 0 ? SpongeBlob.init(this.totalNumBlobFields) : this.blocks[index - 1]?.getEndSpongeBlob();
    if (!startSpongeBlob) {
      throw new Error(
        'Cannot start a new block before the trees have progressed from the tx effects in the previous block.',
      );
    }

    const block = new BlockProvingState(
      index,
      blockNumber,
      totalNumTxs,
      this.constants,
      timestamp,
      lastArchiveTreeSnapshot,
      lastArchiveSiblingPath,
      lastL1ToL2MessageTreeSnapshot,
      lastL1ToL2MessageSubtreeSiblingPath,
      this.headerOfLastBlockInPreviousCheckpoint,
      startSpongeBlob,
      this,
    );
    this.blocks[index] = block;

    return block;
  }

  // Returns true if we are still able to accept blocks, false otherwise.
  public isAcceptingBlocks() {
    return this.blocks.filter(b => !!b).length < this.totalNumBlocks;
  }

  public setBlockRootRollupProof(
    blockIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    return this.blockProofs.setLeaf(blockIndex, { provingOutput });
  }

  public isProvingBlockMerge(location: TreeNodeLocation) {
    return this.blockProofs.getNode(location)?.provingOutput !== undefined;
  }

  public startProvingBlockMerge(location: TreeNodeLocation) {
    this.blockProofs.setNode(location, { isProving: true });
  }

  public setBlockMergeRollupProof(
    location: TreeNodeLocation,
    provingOutput: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.blockProofs.setNode(location, { provingOutput });
  }

  public isProvingCheckpointRoot() {
    return this.checkpointRootProof?.isProving;
  }

  public startProvingCheckpointRoot() {
    this.checkpointRootProof = { isProving: true };
  }

  public setCheckpointRootRollupProof(
    provingOutput: PublicInputsAndRecursiveProof<
      CheckpointRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    this.checkpointRootProof = { provingOutput };
    return this.parentEpoch.setCheckpointRootRollupProof(this.index, provingOutput);
  }

  public getBaseParityInputs(baseParityIndex: number) {
    const messages = padArrayEnd(
      this.l1ToL2Messages.slice(
        baseParityIndex * NUM_MSGS_PER_BASE_PARITY,
        (baseParityIndex + 1) * NUM_MSGS_PER_BASE_PARITY,
      ),
      Fr.ZERO,
      NUM_MSGS_PER_BASE_PARITY,
    );
    return new BaseParityInputs(messages, this.constants.vkTreeRoot);
  }

  public async accumulateBlobs(startBlobAccumulator: BatchedBlobAccumulator) {
    if (this.isAcceptingBlocks() || this.blocks.some(b => b!.isAcceptingTxs())) {
      return;
    }

    const blobFields = this.blocks.flatMap(b => b!.getBlockBlobFields());
    this.endBlobAccumulator = await accumulateBlobs(blobFields, startBlobAccumulator);
    this.startBlobAccumulator = startBlobAccumulator;

    return this.endBlobAccumulator;
  }

  public getEndBlobAccumulator() {
    return this.endBlobAccumulator;
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.blockProofs.getParentLocation(location);
  }

  public getBlockMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.blockProofs.getChildren(mergeLocation).map(c => c?.provingOutput);
    if (!left || !right) {
      throw new Error('At least one child is not ready for the block merge rollup.');
    }

    return new BlockMergeRollupPrivateInputs([toRollupProofData(left), toRollupProofData(right)]);
  }

  public async getCheckpointRootRollupTypeAndInputs() {
    const proofs = this.#getChildProofsForRoot();
    const nonEmptyProofs = proofs.filter(p => !!p);
    if (proofs.length !== nonEmptyProofs.length) {
      throw new Error('At least one child is not ready for the checkpoint root rollup.');
    }

    const blobFields = this.blocks.flatMap(b => b!.getBlockBlobFields());
    const { blobCommitments, blobsHash } = await buildBlobHints(blobFields);

    const hints = CheckpointRootRollupHints.from({
      previousBlockHeader: this.headerOfLastBlockInPreviousCheckpoint,
      previousArchiveSiblingPath: this.lastArchiveSiblingPath,
      startBlobAccumulator: BlobAccumulatorPublicInputs.fromBatchedBlobAccumulator(this.startBlobAccumulator!),
      finalBlobChallenges: this.finalBlobBatchingChallenges,
      blobFields: padArrayEnd(blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
      blobCommitments: padArrayEnd(blobCommitments, BLS12Point.ZERO, BLOBS_PER_BLOCK),
      blobsHash,
    });

    const [left, right] = nonEmptyProofs.map(p => toRollupProofData(p));

    return !right
      ? {
          rollupType: 'checkpoint-root-single-block-rollup' satisfies CircuitName,
          inputs: new CheckpointRootSingleBlockRollupPrivateInputs(left, hints),
        }
      : {
          rollupType: 'checkpoint-root-rollup' satisfies CircuitName,
          inputs: new CheckpointRootRollupPrivateInputs([left, right], hints),
        };
  }

  public getBlockProvingStateByBlockNumber(blockNumber: number) {
    const index = blockNumber - this.firstBlockNumber;
    return this.blocks[index];
  }

  public isReadyForBlockMerge(location: TreeNodeLocation) {
    return !!this.blockProofs.getSibling(location)?.provingOutput;
  }

  public isReadyForCheckpointRoot() {
    const childProofs = this.#getChildProofsForRoot();
    return childProofs.every(p => !!p) && this.startBlobAccumulator !== undefined;
  }

  public verifyState() {
    return this.parentEpoch.verifyState();
  }

  public getError() {
    return this.error;
  }

  // Attempts to reject the proving state promise with a reason of 'cancelled'
  public cancel() {
    this.reject('Proving cancelled');
  }

  public reject(reason: string) {
    this.error = reason;
    this.parentEpoch.reject(reason);
  }

  #getChildProofsForRoot() {
    const rootLocation = { level: 0, index: 0 };
    return this.totalNumBlocks === 1
      ? [this.blockProofs.getNode(rootLocation)?.provingOutput] // If there's only 1 block, its proof will be stored at the root.
      : this.blockProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }
}
