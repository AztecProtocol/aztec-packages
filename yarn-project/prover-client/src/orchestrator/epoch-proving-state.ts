import { type MerkleTreeId, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import {
  ARCHIVE_HEIGHT,
  AppendOnlyTreeSnapshot,
  type BlockHeader,
  BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  ConstantRollupData,
  EmptyBlockRootRollupInputs,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  MembershipWitness,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PreviousRollupBlockData,
  RootRollupInputs,
  type RootRollupPublicInputs,
  VK_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { BlockProvingState } from './block-proving-state.js';

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
  private blockRootOrMergeProvingOutputs: UnbalancedTreeStore<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>
  >;
  private paddingBlockRootProvingOutput: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs> | undefined;
  private rootRollupProvingOutput: PublicInputsAndRecursiveProof<RootRollupPublicInputs> | undefined;
  private provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED;

  public blocks: (BlockProvingState | undefined)[] = [];

  constructor(
    public readonly epochNumber: number,
    public readonly firstBlockNumber: number,
    public readonly totalNumBlocks: number,
    private completionCallback: (result: ProvingResult) => void,
    private rejectionCallback: (reason: string) => void,
  ) {
    this.blockRootOrMergeProvingOutputs = new UnbalancedTreeStore(totalNumBlocks);
  }

  // Adds a block to the proving state, returns its index
  // Will update the proving life cycle if this is the last block
  public startNewBlock(
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    messageTreeSnapshot: AppendOnlyTreeSnapshot,
    messageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    messageTreeSnapshotAfterInsertion: AppendOnlyTreeSnapshot,
    archiveTreeSnapshot: AppendOnlyTreeSnapshot,
    archiveTreeRootSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    previousBlockHeader: BlockHeader,
    previousBlockHash: Fr,
  ): BlockProvingState {
    const index = globalVariables.blockNumber.toNumber() - this.firstBlockNumber;
    const block = new BlockProvingState(
      index,
      globalVariables,
      padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
      messageTreeSnapshot,
      messageTreeRootSiblingPath,
      messageTreeSnapshotAfterInsertion,
      archiveTreeSnapshot,
      archiveTreeRootSiblingPath,
      previousBlockHeader,
      previousBlockHash,
      this,
    );
    this.blocks[index] = block;
    if (this.blocks.filter(b => !!b).length === this.totalNumBlocks) {
      this.provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL;
    }
    return block;
  }

  // Returns true if this proving state is still valid, false otherwise
  public verifyState() {
    return (
      this.provingStateLifecycle === PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED ||
      this.provingStateLifecycle === PROVING_STATE_LIFECYCLE.PROVING_STATE_FULL
    );
  }

  // Returns true if we are still able to accept blocks, false otherwise
  public isAcceptingBlocks() {
    return this.provingStateLifecycle === PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED;
  }

  public setBlockRootRollupProof(
    blockIndex: number,
    proof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>,
  ): TreeNodeLocation {
    return this.blockRootOrMergeProvingOutputs.setLeaf(blockIndex, proof);
  }

  public setBlockMergeRollupProof(
    location: TreeNodeLocation,
    proof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>,
  ) {
    this.blockRootOrMergeProvingOutputs.setNode(location, proof);
  }

  public setRootRollupProof(proof: PublicInputsAndRecursiveProof<RootRollupPublicInputs>) {
    this.rootRollupProvingOutput = proof;
  }

  public setPaddingBlockRootProof(proof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>) {
    this.paddingBlockRootProvingOutput = proof;
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.blockRootOrMergeProvingOutputs.getParentLocation(location);
  }

  public getBlockMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.blockRootOrMergeProvingOutputs.getChildren(mergeLocation);
    if (!left || !right) {
      throw new Error('At lease one child is not ready.');
    }

    return new BlockMergeRollupInputs([this.#getPreviousRollupData(left), this.#getPreviousRollupData(right)]);
  }

  public getRootRollupInputs(proverId: Fr) {
    const [left, right] = this.#getChildProofsForRoot();
    if (!left || !right) {
      throw new Error('At lease one child is not ready.');
    }

    return RootRollupInputs.from({
      previousRollupData: [this.#getPreviousRollupData(left), this.#getPreviousRollupData(right)],
      proverId,
    });
  }

  public getPaddingBlockRootInputs(proverId: Fr) {
    const { block } = this.blocks[0] ?? {};
    const l1ToL2Roots = this.blocks[0]?.getL1ToL2Roots();
    if (!block || !l1ToL2Roots) {
      throw new Error('Epoch needs one completed block in order to be padded.');
    }

    const constants = ConstantRollupData.from({
      lastArchive: block.archive,
      globalVariables: block.header.globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
    });

    return EmptyBlockRootRollupInputs.from({
      l1ToL2Roots,
      newL1ToL2MessageTreeRootSiblingPath: makeTuple(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, Fr.zero),
      startL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot.zero(),
      newArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, Fr.zero),
      previousBlockHash: block.header.hash(),
      previousPartialState: block.header.state.partial,
      constants,
      proverId,
      isPadding: true,
    });
  }

  // Returns a specific transaction proving state
  public getBlockProvingStateByBlockNumber(blockNumber: number) {
    return this.blocks.find(block => block?.blockNumber === blockNumber);
  }

  public getEpochProofResult() {
    if (!this.rootRollupProvingOutput) {
      throw new Error('Unable to get epoch proof result. Root rollup is not ready.');
    }

    return {
      proof: this.rootRollupProvingOutput.proof.binaryProof,
      publicInputs: this.rootRollupProvingOutput.inputs,
    };
  }

  public isReadyForBlockMerge(location: TreeNodeLocation) {
    return this.blockRootOrMergeProvingOutputs.getSibling(location) !== undefined;
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
    return this.totalNumBlocks === 1
      ? [this.blockRootOrMergeProvingOutputs.getNode(rootLocation), this.paddingBlockRootProvingOutput]
      : this.blockRootOrMergeProvingOutputs.getChildren(rootLocation);
  }

  #getPreviousRollupData({
    inputs,
    proof,
    verificationKey,
  }: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>) {
    const leafIndex = getVKIndex(verificationKey.keyAsFields);
    return new PreviousRollupBlockData(
      inputs,
      proof,
      verificationKey.keyAsFields,
      new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)),
    );
  }
}
