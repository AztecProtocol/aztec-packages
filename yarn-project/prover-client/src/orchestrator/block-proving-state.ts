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
  BlockRootRollupBlobData,
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
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
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
    public readonly newL1ToL2Messages: Fr[],
    private readonly l1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    private readonly l1ToL2MessageTreeSnapshotAfterInsertion: AppendOnlyTreeSnapshot,
    private readonly lastArchiveSnapshot: AppendOnlyTreeSnapshot,
    private readonly newArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    private readonly previousBlockHeader: BlockHeader,
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

  public async getMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.baseOrMergeProvingOutputs.getChildren(mergeLocation);
    if (!left || !right) {
      throw new Error('At lease one child is not ready.');
    }

    return new MergeRollupInputs([await this.#getPreviousRollupData(left), await this.#getPreviousRollupData(right)]);
  }

  public async getBlockRootRollupTypeAndInputs(proverId: Fr) {
    if (!this.rootParityProvingOutput) {
      throw new Error('Root parity is not ready.');
    }

    const proofs = this.#getChildProofsForBlockRoot();
    const nonEmptyProofs = proofs.filter(p => !!p);
    if (proofs.length !== nonEmptyProofs.length) {
      throw new Error('At lease one child is not ready for the block root.');
    }

    const data = await this.#getBlockRootRollupData(proverId);

    if (this.totalNumTxs === 0) {
      const constants = ConstantRollupData.from({
        lastArchive: this.lastArchiveSnapshot,
        globalVariables: this.globalVariables,
        vkTreeRoot: await getVKTreeRoot(),
        protocolContractTreeRoot,
      });

      return {
        rollupType: 'empty-block-root-rollup' satisfies CircuitName,
        inputs: EmptyBlockRootRollupInputs.from({
          data,
          constants,
          isPadding: false,
        }),
      };
    }

    const previousRollupData = await Promise.all(nonEmptyProofs.map(p => this.#getPreviousRollupData(p!)));
    const blobData = await this.#getBlockRootRollupBlobData();

    if (previousRollupData.length === 1) {
      return {
        rollupType: 'single-tx-block-root-rollup' satisfies CircuitName,
        inputs: new SingleTxBlockRootRollupInputs(previousRollupData as [PreviousRollupData], data, blobData),
      };
    } else {
      return {
        rollupType: 'block-root-rollup' satisfies CircuitName,
        inputs: new BlockRootRollupInputs(
          previousRollupData as [PreviousRollupData, PreviousRollupData],
          data,
          blobData,
        ),
      };
    }
  }

  public async getPaddingBlockRootInputs(proverId: Fr) {
    if (!this.rootParityProvingOutput) {
      throw new Error('Root parity is not ready.');
    }

    // Use the new block header and archive of the current block as the previous header and archiver of the next padding block.
    const newBlockHeader = await this.buildHeaderFromProvingOutputs();
    const newArchive = this.blockRootProvingOutput!.inputs.newArchive;

    const data = BlockRootRollupData.from({
      l1ToL2Roots: await this.#getRootParityData(this.rootParityProvingOutput!),
      l1ToL2MessageSubtreeSiblingPath: this.l1ToL2MessageSubtreeSiblingPath,
      newArchiveSiblingPath: this.newArchiveSiblingPath,
      previousBlockHeader: newBlockHeader,
      proverId,
    });

    const constants = ConstantRollupData.from({
      lastArchive: newArchive,
      globalVariables: this.globalVariables,
      vkTreeRoot: await getVKTreeRoot(),
      protocolContractTreeRoot,
    });

    return EmptyBlockRootRollupInputs.from({
      data,
      constants,
      isPadding: true,
    });
  }

  public async getRootParityInputs() {
    if (!this.baseParityProvingOutputs.every(p => !!p)) {
      throw new Error('At lease one base parity is not ready.');
    }

    const children = await Promise.all(this.baseParityProvingOutputs.map(p => this.#getRootParityData(p!)));
    return new RootParityInputs(
      children as Tuple<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    );
  }

  // Returns a specific transaction proving state
  public getTxProvingState(txIndex: number) {
    return this.txs[txIndex];
  }

  public async buildHeaderFromProvingOutputs(logger?: Logger) {
    const previousRollupData =
      this.totalNumTxs === 0
        ? []
        : await Promise.all(this.#getChildProofsForBlockRoot().map(p => this.#getPreviousRollupData(p!)));

    let endPartialState = this.previousBlockHeader.state.partial;
    if (this.totalNumTxs !== 0) {
      const previousRollupData = this.#getChildProofsForBlockRoot();
      const lastRollup = previousRollupData[previousRollupData.length - 1];
      if (!lastRollup) {
        throw new Error('End state of the block is not available. Last rollup is not ready yet.');
      }
      endPartialState = lastRollup.inputs.end;
    }
    const endState = new StateReference(this.l1ToL2MessageTreeSnapshotAfterInsertion, endPartialState);

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

  public isComplete() {
    return !!this.blockRootProvingOutput;
  }

  // Returns whether the proving state is still valid
  public verifyState() {
    return this.parentEpoch.verifyState();
  }

  public reject(reason: string) {
    this.error = reason;
    this.parentEpoch.reject(reason);
  }

  async #getBlockRootRollupData(proverId: Fr) {
    return BlockRootRollupData.from({
      l1ToL2Roots: await this.#getRootParityData(this.rootParityProvingOutput!),
      l1ToL2MessageSubtreeSiblingPath: this.l1ToL2MessageSubtreeSiblingPath,
      newArchiveSiblingPath: this.newArchiveSiblingPath,
      previousBlockHeader: this.previousBlockHeader,
      proverId,
    });
  }

  async #getBlockRootRollupBlobData() {
    const txEffects = this.txs.map(txProvingState => txProvingState.processedTx.txEffect);
    const { blobFields, blobCommitments, blobsHash } = await buildBlobHints(txEffects);
    return BlockRootRollupBlobData.from({
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

  async #getPreviousRollupData({
    inputs,
    proof,
    verificationKey,
  }: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>) {
    const leafIndex = await getVKIndex(verificationKey.keyAsFields);
    return new PreviousRollupData(
      inputs,
      proof,
      verificationKey.keyAsFields,
      new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), await getVKSiblingPath(leafIndex)),
    );
  }

  async #getRootParityData({ inputs, proof, verificationKey }: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    return new RootParityInput(
      proof,
      verificationKey.keyAsFields,
      await getVKSiblingPath(await getVKIndex(verificationKey)),
      inputs,
    );
  }
}
