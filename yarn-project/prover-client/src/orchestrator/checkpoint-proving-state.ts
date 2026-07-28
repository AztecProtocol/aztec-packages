import { SpongeBlob } from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  type L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUM_MSGS_PER_BASE_PARITY,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { accumulateInboxRollingHash } from '@aztec/stdlib/messaging';
import { ParityBasePrivateInputs } from '@aztec/stdlib/parity';
import { BlockMergeRollupPrivateInputs, BlockRollupPublicInputs, CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { toProofData } from './block-building-helpers.js';
import { BlockProvingState, type ProofState } from './block-proving-state.js';

export class CheckpointProvingState {
  private blockProofs: UnbalancedTreeStore<
    ProofState<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;
  private blocks: (BlockProvingState | undefined)[] = [];
  private error: string | undefined;
  public readonly firstBlockNumber: BlockNumber;

  constructor(
    public readonly index: number,
    public readonly constants: CheckpointConstantData,
    public readonly totalNumBlocks: number,
    private readonly headerOfLastBlockInPreviousCheckpoint: BlockHeader,
    private readonly lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    private readonly l1ToL2Messages: Fr[],
    // Inbox rolling hash before this checkpoint's messages (the previous checkpoint's end value; genesis is zero).
    // Threaded into the base parity circuits so the resulting checkpoint header rolling hash matches the proposer's.
    private readonly startInboxRollingHash: Fr,
    // The snapshot and sibling path before the new l1 to l2 message subtree is inserted.
    private readonly lastL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastL1ToL2MessageSubtreeRootSiblingPath: Tuple<
      Fr,
      typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH
    >,
    // The snapshot and sibling path after the new l1 to l2 message subtree is inserted.
    private readonly newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly newL1ToL2MessageSubtreeRootSiblingPath: Tuple<
      Fr,
      typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH
    >,
    public readonly epochNumber: number,
    /** Owner's liveness check. `verifyState()` returns false once this returns false. */
    private readonly isAlive: () => boolean,
    /** Owner's failure callback. Invoked from `reject` to surface the error upward. */
    private readonly onReject: (reason: string) => void,
  ) {
    this.blockProofs = new UnbalancedTreeStore(totalNumBlocks);
    this.firstBlockNumber = BlockNumber(headerOfLastBlockInPreviousCheckpoint.globalVariables.blockNumber + 1);
  }

  public startNewBlock(
    blockNumber: BlockNumber,
    timestamp: UInt64,
    totalNumTxs: number,
    lastArchiveTreeSnapshot: AppendOnlyTreeSnapshot,
    lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
  ): BlockProvingState {
    const index = Number(blockNumber) - Number(this.firstBlockNumber);
    if (index >= this.totalNumBlocks) {
      throw new Error(`Unable to start a new block at index ${index}. Expected at most ${this.totalNumBlocks} blocks.`);
    }

    // If this is the first block, we use the snapshot and sibling path before the new l1 to l2 messages are inserted.
    // Otherwise, we use the snapshot and sibling path after the new l1 to l2 messages are inserted, which will always
    // happen in the first block.
    const lastL1ToL2MessageTreeSnapshot =
      index === 0 ? this.lastL1ToL2MessageTreeSnapshot : this.newL1ToL2MessageTreeSnapshot;
    const lastL1ToL2MessageSubtreeRootSiblingPath =
      index === 0 ? this.lastL1ToL2MessageSubtreeRootSiblingPath : this.newL1ToL2MessageSubtreeRootSiblingPath;

    const startSpongeBlob = index === 0 ? SpongeBlob.init() : this.blocks[index - 1]?.getEndSpongeBlob();
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
      lastL1ToL2MessageSubtreeRootSiblingPath,
      this.newL1ToL2MessageTreeSnapshot,
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

  public tryStartProvingBlockMerge(location: TreeNodeLocation) {
    if (this.blockProofs.getNode(location)?.isProving) {
      return false;
    } else {
      this.blockProofs.setNode(location, { isProving: true });
      return true;
    }
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

  public getBaseParityInputs(baseParityIndex: number) {
    const start = baseParityIndex * NUM_MSGS_PER_BASE_PARITY;
    const realMessages = this.l1ToL2Messages.slice(start, start + NUM_MSGS_PER_BASE_PARITY);
    const messages = padArrayEnd(realMessages, Fr.ZERO, NUM_MSGS_PER_BASE_PARITY);
    // Thread the rolling hash: this base's start is the chain value after all real messages in earlier bases, so the
    // four bases chain sequentially and the parity root ends at the checkpoint's rolling hash. Only real (non-padding)
    // messages are absorbed, matching the proposer's `accumulateInboxRollingHash`.
    const startRollingHash = accumulateInboxRollingHash(
      this.startInboxRollingHash,
      this.l1ToL2Messages.slice(0, start),
    );
    return new ParityBasePrivateInputs(
      messages,
      startRollingHash,
      realMessages.length,
      this.constants.vkTreeRoot,
      this.constants.proverId,
    );
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.blockProofs.getParentLocation(location);
  }

  public getBlockMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.blockProofs.getChildren(mergeLocation).map(c => c?.provingOutput);
    if (!left || !right) {
      throw new Error('At least one child is not ready for the block merge rollup.');
    }

    return new BlockMergeRollupPrivateInputs([toProofData(left), toProofData(right)]);
  }

  public getBlockProvingStateByBlockNumber(blockNumber: BlockNumber) {
    const index = Number(blockNumber) - Number(this.firstBlockNumber);
    return this.blocks[index];
  }

  public isReadyForBlockMerge(location: TreeNodeLocation) {
    return !!this.blockProofs.getSibling(location)?.provingOutput;
  }

  public verifyState() {
    return this.isAlive();
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
    this.onReject(reason);
  }

  /**
   * Returns the block-level proof outputs that feed into the checkpoint root rollup.
   * Used by `CheckpointSubTreeOrchestrator` to surface its sub-tree result.
   */
  public getSubTreeOutputProofs() {
    const rootLocation = { level: 0, index: 0 };
    return this.totalNumBlocks === 1
      ? [this.blockProofs.getNode(rootLocation)?.provingOutput] // If there's only 1 block, its proof will be stored at the root.
      : this.blockProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }

  /** Sibling path of the archive tree captured before any block in this checkpoint landed. */
  public getLastArchiveSiblingPath() {
    return this.lastArchiveSiblingPath;
  }
}
