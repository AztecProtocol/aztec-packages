import { type MerkleTreeId } from '@aztec/circuit-types';
import {
  type ARCHIVE_HEIGHT,
  type AppendOnlyTreeSnapshot,
  Fr,
  type GlobalVariables,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  type Proof,
  type RecursiveProof,
  type VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { type BlockRootOrBlockMergePublicInputs, type RootRollupPublicInputs } from '@aztec/circuits.js/rollup';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type Tuple } from '@aztec/foundation/serialize';

import { BlockProvingState } from './block-proving-state.js';

export type TreeSnapshots = Map<MerkleTreeId, AppendOnlyTreeSnapshot>;

enum PROVING_STATE_LIFECYCLE {
  PROVING_STATE_CREATED,
  PROVING_STATE_FULL,
  PROVING_STATE_RESOLVED,
  PROVING_STATE_REJECTED,
}

export type BlockMergeRollupInputData = {
  inputs: [BlockRootOrBlockMergePublicInputs | undefined, BlockRootOrBlockMergePublicInputs | undefined];
  proofs: [
    RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH> | undefined,
    RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH> | undefined,
  ];
  verificationKeys: [VerificationKeyAsFields | undefined, VerificationKeyAsFields | undefined];
};

export type ProvingResult = { status: 'success' } | { status: 'failure'; reason: string };

/**
 * The current state of the proving schedule for an epoch.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 * Carries an identifier so we can identify if the proving state is discarded and a new one started.
 * Captures resolve and reject callbacks to provide a promise base interface to the consumer of our proving.
 */
export class EpochProvingState {
  private provingStateLifecycle = PROVING_STATE_LIFECYCLE.PROVING_STATE_CREATED;

  private mergeRollupInputs: BlockMergeRollupInputData[] = [];
  public rootRollupPublicInputs: RootRollupPublicInputs | undefined;
  public finalProof: Proof | undefined;
  public blocks: (BlockProvingState | undefined)[] = [];

  constructor(
    public readonly epochNumber: number,
    public readonly firstBlockNumber: number,
    public readonly totalNumBlocks: number,
    private completionCallback: (result: ProvingResult) => void,
    private rejectionCallback: (reason: string) => void,
  ) {}

  // Returns the number of levels of merge rollups
  public get numMergeLevels() {
    const totalLeaves = Math.max(2, this.totalNumBlocks);
    return BigInt(Math.ceil(Math.log2(totalLeaves)) - 1);
  }

  // Calculates the index and level of the parent rollup circuit
  // Based on tree implementation in unbalanced_tree.ts -> batchInsert()
  // REFACTOR: This is repeated from the block orchestrator
  public findMergeLevel(currentLevel: bigint, currentIndex: bigint) {
    const totalLeaves = Math.max(2, this.totalNumBlocks);
    const moveUpMergeLevel = (levelSize: number, index: bigint, nodeToShift: boolean) => {
      levelSize /= 2;
      if (levelSize & 1) {
        [levelSize, nodeToShift] = nodeToShift ? [levelSize + 1, false] : [levelSize - 1, true];
      }
      index >>= 1n;
      return { thisLevelSize: levelSize, thisIndex: index, shiftUp: nodeToShift };
    };
    let [thisLevelSize, shiftUp] = totalLeaves & 1 ? [totalLeaves - 1, true] : [totalLeaves, false];
    const maxLevel = this.numMergeLevels + 1n;
    let placeholder = currentIndex;
    for (let i = 0; i < maxLevel - currentLevel; i++) {
      ({ thisLevelSize, thisIndex: placeholder, shiftUp } = moveUpMergeLevel(thisLevelSize, placeholder, shiftUp));
    }
    let thisIndex = currentIndex;
    let mergeLevel = currentLevel;
    while (thisIndex >= thisLevelSize && mergeLevel != 0n) {
      mergeLevel -= 1n;
      ({ thisLevelSize, thisIndex, shiftUp } = moveUpMergeLevel(thisLevelSize, thisIndex, shiftUp));
    }
    return [mergeLevel - 1n, thisIndex >> 1n, thisIndex & 1n];
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

  /**
   * Stores the inputs to a merge circuit and determines if the circuit is ready to be executed
   * @param mergeInputs - The inputs to store
   * @param indexWithinMerge - The index in the set of inputs to this merge circuit
   * @param indexOfMerge - The global index of this merge circuit
   * @returns True if the merge circuit is ready to be executed, false otherwise
   */
  public storeMergeInputs(
    mergeInputs: [
      BlockRootOrBlockMergePublicInputs,
      RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
      VerificationKeyAsFields,
    ],
    indexWithinMerge: number,
    indexOfMerge: number,
  ) {
    if (!this.mergeRollupInputs[indexOfMerge]) {
      const mergeInputData: BlockMergeRollupInputData = {
        inputs: [undefined, undefined],
        proofs: [undefined, undefined],
        verificationKeys: [undefined, undefined],
      };
      mergeInputData.inputs[indexWithinMerge] = mergeInputs[0];
      mergeInputData.proofs[indexWithinMerge] = mergeInputs[1];
      mergeInputData.verificationKeys[indexWithinMerge] = mergeInputs[2];
      this.mergeRollupInputs[indexOfMerge] = mergeInputData;
      return false;
    }
    const mergeInputData = this.mergeRollupInputs[indexOfMerge];
    mergeInputData.inputs[indexWithinMerge] = mergeInputs[0];
    mergeInputData.proofs[indexWithinMerge] = mergeInputs[1];
    mergeInputData.verificationKeys[indexWithinMerge] = mergeInputs[2];
    return true;
  }

  // Returns a specific transaction proving state
  public getBlockProvingStateByBlockNumber(blockNumber: number) {
    return this.blocks.find(block => block?.blockNumber === blockNumber);
  }

  // Returns a set of merge rollup inputs
  public getMergeInputs(indexOfMerge: number) {
    return this.mergeRollupInputs[indexOfMerge];
  }

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForRootRollup() {
    return !(this.mergeRollupInputs[0] === undefined || this.mergeRollupInputs[0].inputs.findIndex(p => !p) !== -1);
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
}
