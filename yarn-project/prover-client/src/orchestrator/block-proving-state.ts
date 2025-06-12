import { SpongeBlob } from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  BLOBS_PER_BLOCK,
  FIELDS_PER_BLOB,
  type L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import { getVKIndex, getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import type { L2Block } from '@aztec/stdlib/block';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { type ParityPublicInputs, RootParityInput, RootParityInputs } from '@aztec/stdlib/parity';
import {
  type BaseOrMergeRollupPublicInputs,
  BlockConstantData,
  type BlockRootOrBlockMergePublicInputs,
  BlockRootRollupBlobData,
  BlockRootRollupData,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PreviousRollupData,
  SingleTxBlockRootRollupInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import type { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import { type BlockHeader, type GlobalVariables, StateReference } from '@aztec/stdlib/tx';
import { VkData } from '@aztec/stdlib/vks';

import { buildBlobHints, buildHeaderFromCircuitOutputs } from './block-building-helpers.js';
import type { EpochProvingState } from './epoch-proving-state.js';
import type { TxProvingState } from './tx-proving-state.js';

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
    public readonly l1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly l1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    private readonly l1ToL2MessageTreeSnapshotAfterInsertion: AppendOnlyTreeSnapshot,
    private readonly lastArchiveSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
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

  public getMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.baseOrMergeProvingOutputs.getChildren(mergeLocation);
    if (!left || !right) {
      throw new Error('At lease one child is not ready.');
    }

    return new MergeRollupInputs([this.#getPreviousRollupData(left), this.#getPreviousRollupData(right)]);
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

    const data = this.#getBlockRootRollupData(proverId);

    if (this.totalNumTxs === 0) {
      const constants = BlockConstantData.from({
        lastArchive: this.lastArchiveSnapshot,
        lastL1ToL2: this.l1ToL2MessageTreeSnapshot,
        globalVariables: this.globalVariables,
        vkTreeRoot: getVKTreeRoot(),
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

    // Use the new block header, archive and l1toL2 of the current block as the previous header, archive and l1toL2 of the next padding block.
    const previousBlockHeader = await this.buildHeaderFromProvingOutputs();
    const lastArchive = this.blockRootProvingOutput!.inputs.newArchive;
    const lastL1ToL2 = this.l1ToL2MessageTreeSnapshotAfterInsertion;

    const data = BlockRootRollupData.from({
      l1ToL2Roots: this.#getRootParityData(this.rootParityProvingOutput!),
      l1ToL2MessageSubtreeSiblingPath: this.l1ToL2MessageSubtreeSiblingPath,
      previousArchiveSiblingPath: this.lastArchiveSiblingPath,
      newArchiveSiblingPath: this.newArchiveSiblingPath,
      previousBlockHeader,
      proverId,
    });

    const constants = BlockConstantData.from({
      lastArchive,
      lastL1ToL2,
      globalVariables: this.globalVariables,
      vkTreeRoot: getVKTreeRoot(),
      protocolContractTreeRoot,
    });

    return EmptyBlockRootRollupInputs.from({
      data,
      constants,
      isPadding: true,
    });
  }

  public getRootParityInputs() {
    if (!this.baseParityProvingOutputs.every(p => !!p)) {
      throw new Error('At lease one base parity is not ready.');
    }

    const children = this.baseParityProvingOutputs.map(p => this.#getRootParityData(p!));
    return new RootParityInputs(
      children as Tuple<RootParityInput<typeof RECURSIVE_PROOF_LENGTH>, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    );
  }

  // Returns a specific transaction proving state
  public getTxProvingState(txIndex: number) {
    return this.txs[txIndex];
  }

  public async buildHeaderFromProvingOutputs() {
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

  #getBlockRootRollupData(proverId: Fr) {
    return BlockRootRollupData.from({
      l1ToL2Roots: this.#getRootParityData(this.rootParityProvingOutput!),
      l1ToL2MessageSubtreeSiblingPath: this.l1ToL2MessageSubtreeSiblingPath,
      previousArchiveSiblingPath: this.lastArchiveSiblingPath,
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

  #getPreviousRollupData({
    inputs,
    proof,
    verificationKey,
  }: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>) {
    const leafIndex = getVKIndex(verificationKey.keyAsFields);
    const vkData = new VkData(verificationKey, leafIndex, getVKSiblingPath(leafIndex));
    return new PreviousRollupData(inputs, proof, vkData);
  }

  #getRootParityData({ inputs, proof, verificationKey }: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    return new RootParityInput(
      proof,
      verificationKey.keyAsFields,
      getVKSiblingPath(getVKIndex(verificationKey)),
      inputs,
    );
  }
}
