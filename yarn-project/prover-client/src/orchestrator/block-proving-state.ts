import { type L2Block, type MerkleTreeId } from '@aztec/circuit-types';
import {
  type ARCHIVE_HEIGHT,
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  type Fr,
  type GlobalVariables,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type Proof,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  SpongeBlob,
  type VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';

import { type EpochProvingState } from './epoch-proving-state.js';
import { type TxProvingState } from './tx-proving-state.js';

export type MergeRollupInputData = {
  inputs: [BaseOrMergeRollupPublicInputs | undefined, BaseOrMergeRollupPublicInputs | undefined];
  proofs: [
    RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined,
    RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined,
  ];
  verificationKeys: [VerificationKeyAsFields | undefined, VerificationKeyAsFields | undefined];
};

export type TreeSnapshots = Map<MerkleTreeId, AppendOnlyTreeSnapshot>;

/**
 * The current state of the proving schedule for a given block. Managed by ProvingState.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 */
export class BlockProvingState {
  private mergeRollupInputs: MergeRollupInputData[] = [];
  private rootParityInputs: Array<RootParityInput<typeof RECURSIVE_PROOF_LENGTH> | undefined> = [];
  private finalRootParityInputs: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined;
  public blockRootRollupPublicInputs: BlockRootOrBlockMergePublicInputs | undefined;
  public blockRootRollupStarted: boolean = false;
  public finalProof: Proof | undefined;
  public block: L2Block | undefined;
  public spongeBlobState: SpongeBlob | undefined;
  public totalNumTxs: number;
  private txs: TxProvingState[] = [];
  public error: string | undefined;

  constructor(
    public readonly index: number,
    public readonly globalVariables: GlobalVariables,
    public readonly newL1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
    public readonly messageTreeSnapshot: AppendOnlyTreeSnapshot,
    public readonly messageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    public readonly messageTreeSnapshotAfterInsertion: AppendOnlyTreeSnapshot,
    public readonly archiveTreeSnapshot: AppendOnlyTreeSnapshot,
    public readonly archiveTreeRootSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    public readonly previousBlockHash: Fr,
    private readonly parentEpoch: EpochProvingState,
  ) {
    this.rootParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }).map(_ => undefined);
    this.totalNumTxs = 0;
  }

  public get blockNumber() {
    return this.globalVariables.blockNumber.toNumber();
  }

  // Returns the number of levels of merge rollups
  public get numMergeLevels() {
    return BigInt(Math.ceil(Math.log2(this.totalNumTxs)) - 1);
  }

  // Calculates the index and level of the parent rollup circuit
  // Based on tree implementation in unbalanced_tree.ts -> batchInsert()
  public findMergeLevel(currentLevel: bigint, currentIndex: bigint) {
    const moveUpMergeLevel = (levelSize: number, index: bigint, nodeToShift: boolean) => {
      levelSize /= 2;
      if (levelSize & 1) {
        [levelSize, nodeToShift] = nodeToShift ? [levelSize + 1, false] : [levelSize - 1, true];
      }
      index >>= 1n;
      return { thisLevelSize: levelSize, thisIndex: index, shiftUp: nodeToShift };
    };
    let [thisLevelSize, shiftUp] = this.totalNumTxs & 1 ? [this.totalNumTxs - 1, true] : [this.totalNumTxs, false];
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

  public startNewBlock(numTxs: number, numBlobFields: number) {
    if (this.spongeBlobState) {
      throw new Error(`Block ${this.blockNumber} already initalised.`);
    }
    // Initialise the sponge which will eventually absorb all tx effects to be added to the blob.
    // Like l1 to l2 messages, we need to know beforehand how many effects will be absorbed.
    this.spongeBlobState = SpongeBlob.init(numBlobFields);
    this.totalNumTxs = numTxs;
  }

  // Adds a transaction to the proving state, returns it's index
  public addNewTx(tx: TxProvingState) {
    if (!this.spongeBlobState) {
      throw new Error(`Invalid block proving state, call startNewBlock before adding transactions.`);
    }
    this.txs.push(tx);
    return this.txs.length - 1;
  }

  // Returns the number of received transactions
  public get transactionsReceived() {
    return this.txs.length;
  }

  // Returns the final set of root parity inputs
  public get finalRootParityInput() {
    return this.finalRootParityInputs;
  }

  // Sets the final set of root parity inputs
  public set finalRootParityInput(input: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined) {
    this.finalRootParityInputs = input;
  }

  // Returns the set of root parity inputs
  public get rootParityInput() {
    return this.rootParityInputs;
  }

  // Returns the complete set of transaction proving state objects
  public get allTxs() {
    return this.txs;
  }

  /** Returns the block number as an epoch number. Used for prioritizing proof requests. */
  public get epochNumber(): number {
    return this.parentEpoch.epochNumber;
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
      BaseOrMergeRollupPublicInputs,
      RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
      VerificationKeyAsFields,
    ],
    indexWithinMerge: number,
    indexOfMerge: number,
  ) {
    if (!this.mergeRollupInputs[indexOfMerge]) {
      const mergeInputData: MergeRollupInputData = {
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
  public getTxProvingState(txIndex: number) {
    return this.txs[txIndex];
  }

  // Returns a set of merge rollup inputs
  public getMergeInputs(indexOfMerge: number) {
    return this.mergeRollupInputs[indexOfMerge];
  }

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForBlockRootRollup() {
    return !(
      this.block === undefined ||
      this.mergeRollupInputs[0] === undefined ||
      this.finalRootParityInput === undefined ||
      this.mergeRollupInputs[0].inputs.findIndex(p => !p) !== -1
    );
  }

  // Stores a set of root parity inputs at the given index
  public setRootParityInputs(inputs: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>, index: number) {
    this.rootParityInputs[index] = inputs;
  }

  // Returns true if we have sufficient root parity inputs to execute the root parity circuit
  public areRootParityInputsReady() {
    return this.rootParityInputs.findIndex(p => !p) === -1;
  }

  // Returns whether the proving state is still valid
  public verifyState() {
    return this.parentEpoch.verifyState();
  }

  public reject(reason: string) {
    this.error = reason;
    this.parentEpoch.reject(reason);
  }
}
