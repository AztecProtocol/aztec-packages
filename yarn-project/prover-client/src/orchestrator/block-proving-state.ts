import { type L2Block, type MerkleTreeId, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import { type CircuitName } from '@aztec/circuit-types/stats';
import {
  type ARCHIVE_HEIGHT,
  type AppendOnlyTreeSnapshot,
  BLOBS_PER_BLOCK,
  type BlockHeader,
  FIELDS_PER_BLOB,
  Fr,
  type GlobalVariables,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  MembershipWitness,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  type RECURSIVE_PROOF_LENGTH,
  RootParityInput,
  RootParityInputs,
  StateReference,
  VK_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { SpongeBlob } from '@aztec/circuits.js/blobs';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockRootOrBlockMergePublicInputs,
  BlockRootRollupData,
  BlockRootRollupInputs,
  ConstantRollupData,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PreviousRollupData,
  SingleTxBlockRootRollupInputs,
} from '@aztec/circuits.js/rollup';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type Logger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { buildBlobHints, buildHeaderFromCircuitOutputs } from './block-building-helpers.js';
import { type EpochProvingState } from './epoch-proving-state.js';
import { type TxProvingState } from './tx-proving-state.js';

export type TreeSnapshots = Map<MerkleTreeId, AppendOnlyTreeSnapshot>;

/**
 * The current state of the proving schedule for a given block. Managed by ProvingState.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 */
export class BlockProvingState {
  private baseOrMergeProvingOutputs: UnbalancedTreeStore<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > = new UnbalancedTreeStore(0);
  private baseParityProvingOutputs: (PublicInputsAndRecursiveProof<ParityPublicInputs> | undefined)[];
  private rootParityProvingOutput: PublicInputsAndRecursiveProof<ParityPublicInputs> | undefined;
  private blockRootProvingOutput:
    | PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  public blockRootRollupStarted: boolean = false;
  public block: L2Block | undefined;
  public spongeBlobState: SpongeBlob | undefined;
  public totalNumTxs: number;
  private txs: TxProvingState[] = [];
  public error: string | undefined;

  constructor(
    public readonly index: number,
    public readonly globalVariables: GlobalVariables,
    public readonly newL1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
    private readonly messageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly messageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    private readonly messageTreeSnapshotAfterInsertion: AppendOnlyTreeSnapshot,
    private readonly archiveTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly archiveTreeRootSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    private readonly previousBlockHeader: BlockHeader,
    private readonly previousBlockHash: Fr,
    private readonly parentEpoch: EpochProvingState,
  ) {
    this.baseParityProvingOutputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }).map(_ => undefined);
    this.totalNumTxs = 0;
  }

  public get blockNumber() {
    return this.globalVariables.blockNumber.toNumber();
  }

  public startNewBlock(numTxs: number, numBlobFields: number) {
    if (this.spongeBlobState) {
      throw new Error(`Block ${this.blockNumber} already initalised.`);
    }

    this.baseOrMergeProvingOutputs = new UnbalancedTreeStore(numTxs);
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

    const txIndex = this.txs.length;
    this.txs[txIndex] = tx;
    return txIndex;
  }

  public setBaseRollupProof(
    txIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      BaseOrMergeRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    return this.baseOrMergeProvingOutputs.setLeaf(txIndex, provingOutput);
  }

  public setMergeRollupProof(
    location: TreeNodeLocation,
    provingOutput: PublicInputsAndRecursiveProof<
      BaseOrMergeRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.baseOrMergeProvingOutputs.setNode(location, provingOutput);
  }

  // Stores a set of root parity inputs at the given index
  public setBaseParityProof(index: number, provingOutput: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    if (index >= NUM_BASE_PARITY_PER_ROOT_PARITY) {
      throw new Error(
        `Unable to set a base parity proofs at index ${index}. Expected at most ${NUM_BASE_PARITY_PER_ROOT_PARITY} proofs.`,
      );
    }
    this.baseParityProvingOutputs[index] = provingOutput;
  }

  public setRootParityProof(provingOutput: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    this.rootParityProvingOutput = provingOutput;
  }

  public setBlockRootRollupProof(
    provingOutput: PublicInputsAndRecursiveProof<
      BlockRootOrBlockMergePublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.blockRootProvingOutput = provingOutput;
  }

  // Returns the complete set of transaction proving state objects
  public get allTxs() {
    return this.txs;
  }

  /** Returns the block number as an epoch number. Used for prioritizing proof requests. */
  public get epochNumber(): number {
    return this.parentEpoch.epochNumber;
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.baseOrMergeProvingOutputs.getParentLocation(location);
  }

  public getMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.baseOrMergeProvingOutputs.getChildren(mergeLocation);
    if (!left || !right) {
      throw new Error('At lease one child is not ready.');
    }

    return new MergeRollupInputs([this.#getPreviousRollupData(left), this.#getPreviousRollupData(right)]);
  }

  public getBlockRootRollupTypeAndInputs(proverId: Fr) {
    if (this.totalNumTxs === 0) {
      return {
        rollupType: 'empty-block-root-rollup' satisfies CircuitName,
        inputs: this.#getEmptyBlockRootInputs(proverId),
      };
    }

    const proofs = this.#getChildProofsForBlockRoot();
    const nonEmptyProofs = proofs.filter(p => !!p);
    if (proofs.length !== nonEmptyProofs.length) {
      throw new Error('At lease one child is not ready for the block root.');
    }

    const previousRollupData = nonEmptyProofs.map(p => this.#getPreviousRollupData(p!));
    const data = this.#getBlockRootRollupData(proverId);

    if (previousRollupData.length === 1) {
      return {
        rollupType: 'single-tx-block-root-rollup' satisfies CircuitName,
        inputs: new SingleTxBlockRootRollupInputs(previousRollupData as [PreviousRollupData], data),
      };
    } else {
      return {
        rollupType: 'block-root-rollup' satisfies CircuitName,
        inputs: new BlockRootRollupInputs(previousRollupData as [PreviousRollupData, PreviousRollupData], data),
      };
    }
  }

  public getRootParityInputs() {
    if (!this.baseParityProvingOutputs.every(p => !!p)) {
      throw new Error('At lease one base parity is not ready.');
    }

    const children = this.baseParityProvingOutputs.map(p => this.#getRootParityInputFromProvingOutput(p!));
    return new RootParityInputs(
      children as Tuple<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    );
  }

  public getL1ToL2Roots() {
    if (!this.rootParityProvingOutput) {
      throw new Error('Root parity is not ready.');
    }

    return this.#getRootParityInputFromProvingOutput(this.rootParityProvingOutput);
  }

  // Returns a specific transaction proving state
  public getTxProvingState(txIndex: number) {
    return this.txs[txIndex];
  }

  public buildHeaderFromProvingOutputs(logger?: Logger) {
    const previousRollupData =
      this.totalNumTxs === 0 ? [] : this.#getChildProofsForBlockRoot().map(p => this.#getPreviousRollupData(p!));

    let endPartialState = this.previousBlockHeader.state.partial;
    if (this.totalNumTxs !== 0) {
      const previousRollupData = this.#getChildProofsForBlockRoot();
      const lastRollup = previousRollupData[previousRollupData.length - 1];
      if (!lastRollup) {
        throw new Error('End state of the block is not available. Last rollup is not ready yet.');
      }
      endPartialState = lastRollup.inputs.end;
    }
    const endState = new StateReference(this.messageTreeSnapshotAfterInsertion, endPartialState);

    return buildHeaderFromCircuitOutputs(
      previousRollupData.map(d => d.baseOrMergeRollupPublicInputs),
      this.rootParityProvingOutput!.inputs,
      this.blockRootProvingOutput!.inputs,
      endState,
      logger,
    );
  }

  public isReadyForMergeRollup(location: TreeNodeLocation) {
    return this.baseOrMergeProvingOutputs.getSibling(location) !== undefined;
  }

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForBlockRootRollup() {
    const childProofs = this.#getChildProofsForBlockRoot();
    return this.block !== undefined && this.rootParityProvingOutput !== undefined && childProofs.every(p => !!p);
  }

  // Returns true if we have sufficient root parity inputs to execute the root parity circuit
  public isReadyForRootParity() {
    return this.baseParityProvingOutputs.every(p => !!p);
  }

  // Returns whether the proving state is still valid
  public verifyState() {
    return this.parentEpoch.verifyState();
  }

  public reject(reason: string) {
    this.error = reason;
    this.parentEpoch.reject(reason);
  }

  #getEmptyBlockRootInputs(proverId: Fr) {
    const l1ToL2Roots = this.getL1ToL2Roots();
    const constants = ConstantRollupData.from({
      lastArchive: this.archiveTreeSnapshot,
      globalVariables: this.globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
    });

    return EmptyBlockRootRollupInputs.from({
      l1ToL2Roots,
      newL1ToL2MessageTreeRootSiblingPath: this.messageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot: this.messageTreeSnapshot,
      newArchiveSiblingPath: this.archiveTreeRootSiblingPath,
      previousBlockHash: this.previousBlockHash,
      previousPartialState: this.previousBlockHeader.state.partial,
      constants,
      proverId,
      isPadding: false,
    });
  }

  #getBlockRootRollupData(proverId: Fr) {
    const txEffects = this.txs.map(txProvingState => txProvingState.processedTx.txEffect);
    const { blobFields, blobCommitments, blobsHash } = buildBlobHints(txEffects);
    return BlockRootRollupData.from({
      l1ToL2Roots: this.getL1ToL2Roots(),
      newL1ToL2MessageTreeRootSiblingPath: this.messageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot: this.messageTreeSnapshot,
      newArchiveSiblingPath: this.archiveTreeRootSiblingPath,
      previousBlockHash: this.previousBlockHash,
      proverId,
      blobFields: padArrayEnd(blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
      blobCommitments: padArrayEnd(blobCommitments, [Fr.ZERO, Fr.ZERO], BLOBS_PER_BLOCK),
      blobsHash,
    });
  }

  #getChildProofsForBlockRoot() {
    if (this.totalNumTxs === 0) {
      return [];
    }

    const rootLocation = { level: 0, index: 0 };
    // If there's only 1 tx, its base rollup proof will be stored at the root.
    return this.totalNumTxs === 1
      ? [this.baseOrMergeProvingOutputs.getNode(rootLocation)]
      : this.baseOrMergeProvingOutputs.getChildren(rootLocation);
  }

  #getPreviousRollupData({
    inputs,
    proof,
    verificationKey,
  }: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>) {
    const leafIndex = getVKIndex(verificationKey.keyAsFields);
    return new PreviousRollupData(
      inputs,
      proof,
      verificationKey.keyAsFields,
      new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex)),
    );
  }

  #getRootParityInputFromProvingOutput({
    inputs,
    proof,
    verificationKey,
  }: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    return new RootParityInput(
      proof,
      verificationKey.keyAsFields,
      getVKSiblingPath(getVKIndex(verificationKey)),
      inputs,
    );
  }
}
