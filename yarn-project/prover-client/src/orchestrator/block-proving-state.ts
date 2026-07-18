import { type BlockBlobData, type BlockEndBlobData, type SpongeBlob, encodeBlockEndBlobData } from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  type L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_L1_TO_L2_MSGS_PER_BLOCK,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { L1ToL2MessageBundle, makeL1ToL2MessageBundle } from '@aztec/stdlib/messaging';
import type { RollupHonkProofData } from '@aztec/stdlib/proofs';
import {
  BlockRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointConstantData,
  TxMergeRollupPrivateInputs,
  type TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import type { CircuitName } from '@aztec/stdlib/stats';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, StateReference } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { buildHeaderFromCircuitOutputs, toProofData } from './block-building-helpers.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import type { TxProvingState } from './tx-proving-state.js';

export type ProofState<T, PROOF_LENGTH extends number> = {
  provingOutput?: PublicInputsAndRecursiveProof<T, PROOF_LENGTH>;
  isProving?: boolean;
};

/**
 * The block-root rollup flavor a block proves with and its private inputs, discriminated by circuit name so callers
 * can dispatch to the matching prover entrypoint with the correctly-typed inputs.
 */
export type BlockRootRollupTypeAndInputs =
  | { rollupType: 'rollup-block-root-first'; inputs: BlockRootFirstRollupPrivateInputs }
  | { rollupType: 'rollup-block-root-first-single-tx'; inputs: BlockRootSingleTxFirstRollupPrivateInputs }
  | { rollupType: 'rollup-block-root-first-empty-tx'; inputs: BlockRootEmptyTxFirstRollupPrivateInputs }
  | { rollupType: 'rollup-block-root-single-tx'; inputs: BlockRootSingleTxRollupPrivateInputs }
  | { rollupType: 'rollup-block-root'; inputs: BlockRootRollupPrivateInputs };

/**
 * The current state of the proving schedule for a given block. Managed by ProvingState.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 */
export class BlockProvingState {
  private baseOrMergeProofs: UnbalancedTreeStore<
    ProofState<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > = new UnbalancedTreeStore(0);
  private blockRootProof:
    | ProofState<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private builtBlockHeader: BlockHeader | undefined;
  private builtArchive: AppendOnlyTreeSnapshot | undefined;
  private endState: StateReference | undefined;
  private endSpongeBlob: SpongeBlob | undefined;
  private txs: TxProvingState[] = [];
  private isFirstBlock: boolean;
  private error: string | undefined;

  constructor(
    public readonly index: number,
    public readonly blockNumber: BlockNumber,
    public readonly totalNumTxs: number,
    private readonly constants: CheckpointConstantData,
    private readonly timestamp: UInt64,
    public readonly lastArchiveTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    private readonly lastL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastL1ToL2MessageSubtreeRootSiblingPath: Tuple<
      Fr,
      typeof L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH
    >,
    public readonly newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly headerOfLastBlockInPreviousCheckpoint: BlockHeader,
    private readonly startSpongeBlob: SpongeBlob,
    public parentCheckpoint: CheckpointProvingState,
  ) {
    this.isFirstBlock = index === 0;
    if (!totalNumTxs && !this.isFirstBlock) {
      throw new Error(`Cannot create a block with 0 txs, unless it's the first block.`);
    }

    this.baseOrMergeProofs = new UnbalancedTreeStore(totalNumTxs);
  }

  public get epochNumber(): number {
    return this.parentCheckpoint.epochNumber;
  }

  // Adds a transaction to the proving state, returns it's index
  public addNewTx(tx: TxProvingState) {
    if (!this.isAcceptingTxs()) {
      throw new Error(`Cannot add more txs to block ${this.blockNumber}.`);
    }
    const txIndex = this.txs.length;
    this.txs[txIndex] = tx;
    return txIndex;
  }

  public isAcceptingTxs() {
    return this.txs.length < this.totalNumTxs;
  }

  public getProcessedTxs() {
    return this.txs.map(t => t.processedTx);
  }

  public tryStartProvingBase(txIndex: number) {
    if (this.baseOrMergeProofs.getLeaf(txIndex)?.isProving) {
      return false;
    } else {
      this.baseOrMergeProofs.setLeaf(txIndex, { isProving: true });
      return true;
    }
  }

  public setBaseRollupProof(
    txIndex: number,
    provingOutput: PublicInputsAndRecursiveProof<
      TxRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    return this.baseOrMergeProofs.setLeaf(txIndex, { provingOutput });
  }

  public tryStartProvingMerge(location: TreeNodeLocation) {
    if (this.baseOrMergeProofs.getNode(location)?.isProving) {
      return false;
    } else {
      this.baseOrMergeProofs.setNode(location, { isProving: true });
      return true;
    }
  }

  public setMergeRollupProof(
    location: TreeNodeLocation,
    provingOutput: PublicInputsAndRecursiveProof<
      TxRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ) {
    this.baseOrMergeProofs.setNode(location, { provingOutput });
  }

  public tryStartProvingBlockRoot() {
    if (this.blockRootProof?.isProving) {
      return false;
    } else {
      this.blockRootProof = { isProving: true };
      return true;
    }
  }

  public setBlockRootRollupProof(
    provingOutput: PublicInputsAndRecursiveProof<
      BlockRollupPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >,
  ): TreeNodeLocation {
    this.blockRootProof = { provingOutput };
    return this.parentCheckpoint.setBlockRootRollupProof(this.index, provingOutput);
  }

  public getBlockRootRollupOutput() {
    return this.blockRootProof?.provingOutput?.inputs;
  }

  public async buildBlockHeader() {
    if (this.isAcceptingTxs()) {
      throw new Error('All txs must be added to the block before building the header.');
    }
    if (!this.endState) {
      throw new Error('Call `setEndState` first.');
    }
    if (!this.endSpongeBlob) {
      throw new Error('Call `setEndSpongeBlob` first.');
    }

    const endSpongeBlob = this.endSpongeBlob.clone();
    const endSpongeBlobHash = await endSpongeBlob.squeeze();

    this.builtBlockHeader = new BlockHeader(
      this.lastArchiveTreeSnapshot,
      this.endState,
      endSpongeBlobHash,
      this.#getGlobalVariables(),
      this.#getTotalFees(),
      new Fr(this.#getTotalManaUsed()),
    );

    return this.builtBlockHeader;
  }

  public getBuiltBlockHeader() {
    return this.builtBlockHeader;
  }

  public setBuiltArchive(archive: AppendOnlyTreeSnapshot) {
    this.builtArchive = archive;
  }

  public getBuiltArchive() {
    return this.builtArchive;
  }

  public getStartSpongeBlob() {
    return this.startSpongeBlob;
  }

  public setEndSpongeBlob(endSpongeBlob: SpongeBlob) {
    this.endSpongeBlob = endSpongeBlob;
  }

  public getEndSpongeBlob() {
    return this.endSpongeBlob;
  }

  public setEndState(endState: StateReference) {
    this.endState = endState;
  }

  public hasEndState() {
    return !!this.endState;
  }

  public getBlockEndBlobFields(): Fr[] {
    return encodeBlockEndBlobData(this.getBlockEndBlobData());
  }

  getBlockEndBlobData(): BlockEndBlobData {
    if (!this.endState) {
      throw new Error('Call `setEndState` first.');
    }

    const partial = this.endState.partial;
    return {
      blockEndMarker: {
        numTxs: this.totalNumTxs,
        timestamp: this.timestamp,
        blockNumber: this.blockNumber,
      },
      blockEndStateField: {
        l1ToL2MessageNextAvailableLeafIndex: this.newL1ToL2MessageTreeSnapshot.nextAvailableLeafIndex,
        noteHashNextAvailableLeafIndex: partial.noteHashTree.nextAvailableLeafIndex,
        nullifierNextAvailableLeafIndex: partial.nullifierTree.nextAvailableLeafIndex,
        publicDataNextAvailableLeafIndex: partial.publicDataTree.nextAvailableLeafIndex,
        totalManaUsed: this.#getTotalManaUsed(),
      },
      lastArchiveRoot: this.lastArchiveTreeSnapshot.root,
      noteHashRoot: partial.noteHashTree.root,
      nullifierRoot: partial.nullifierTree.root,
      publicDataRoot: partial.publicDataTree.root,
      // Every block carries its own post-bundle l1-to-l2 message tree root (AZIP-22 Fast Inbox).
      l1ToL2MessageRoot: this.newL1ToL2MessageTreeSnapshot.root,
    };
  }

  public getBlockBlobData(): BlockBlobData {
    return {
      ...this.getBlockEndBlobData(),
      txs: this.getTxEffects().map(t => t.toTxBlobData()),
    };
  }

  public getTxEffects() {
    return this.txs.map(t => t.processedTx.txEffect);
  }

  public getParentLocation(location: TreeNodeLocation) {
    return this.baseOrMergeProofs.getParentLocation(location);
  }

  public getMergeRollupInputs(mergeLocation: TreeNodeLocation) {
    const [left, right] = this.baseOrMergeProofs.getChildren(mergeLocation).map(c => c?.provingOutput);
    if (!left || !right) {
      throw new Error('At least one child is not ready for the merge rollup.');
    }

    return new TxMergeRollupPrivateInputs([toProofData(left), toProofData(right)]);
  }

  public getBlockRootRollupTypeAndInputs(): BlockRootRollupTypeAndInputs {
    const provingOutputs = this.#getChildProvingOutputsForBlockRoot();
    if (!provingOutputs.every(p => !!p)) {
      throw new Error('At least one child is not ready for the block root rollup.');
    }

    const previousRollups = provingOutputs.map(p => toProofData(p));

    if (this.isFirstBlock) {
      return this.#getFirstBlockRootRollupTypeAndInputs(previousRollups);
    }

    const messageBundle = this.#getMessageBundle();
    const frontierHint = this.#getFrontierHint();
    const startMsgSponge = this.parentCheckpoint.getCheckpointMsgSponge();

    const [leftRollup, rightRollup] = previousRollups;
    if (!rightRollup) {
      return {
        rollupType: 'rollup-block-root-single-tx' satisfies CircuitName,
        inputs: new BlockRootSingleTxRollupPrivateInputs(
          leftRollup,
          messageBundle,
          this.lastL1ToL2MessageTreeSnapshot,
          startMsgSponge,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    } else {
      return {
        rollupType: 'rollup-block-root' satisfies CircuitName,
        inputs: new BlockRootRollupPrivateInputs(
          [leftRollup, rightRollup],
          messageBundle,
          this.lastL1ToL2MessageTreeSnapshot,
          startMsgSponge,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    }
  }

  #getFirstBlockRootRollupTypeAndInputs([
    leftRollup,
    rightRollup,
  ]: RollupHonkProofData<TxRollupPublicInputs>[]): BlockRootRollupTypeAndInputs {
    const messageBundle = this.#getMessageBundle();
    const frontierHint = this.#getFrontierHint();

    if (!leftRollup) {
      return {
        rollupType: 'rollup-block-root-first-empty-tx' satisfies CircuitName,
        inputs: new BlockRootEmptyTxFirstRollupPrivateInputs(
          this.lastArchiveTreeSnapshot,
          this.headerOfLastBlockInPreviousCheckpoint.state,
          this.constants,
          this.timestamp,
          messageBundle,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    } else if (!rightRollup) {
      return {
        rollupType: 'rollup-block-root-first-single-tx' satisfies CircuitName,
        inputs: new BlockRootSingleTxFirstRollupPrivateInputs(
          leftRollup,
          messageBundle,
          this.lastL1ToL2MessageTreeSnapshot,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    } else {
      return {
        rollupType: 'rollup-block-root-first' satisfies CircuitName,
        inputs: new BlockRootFirstRollupPrivateInputs(
          [leftRollup, rightRollup],
          messageBundle,
          this.lastL1ToL2MessageTreeSnapshot,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    }
  }

  /**
   * The real-count message bundle this block appends (AZIP-22 Fast Inbox): the real leaves inserted at compact indices
   * and absorbed into the message sponge.
   *
   * TODO(fast-inbox): the prover still assigns the whole checkpoint's messages to the first block. Post-flip a block
   * carries at most `MAX_L1_TO_L2_MSGS_PER_BLOCK` and a checkpoint drains its consumption across up to four blocks, so
   * this must split the checkpoint's messages per block (with per-block start/end snapshots and full-height frontier
   * hints at compact indices). Requires the proving-path rework; verified by epoch-proving e2e on CI.
   */
  #getMessageBundle(): L1ToL2MessageBundle {
    if (this.isFirstBlock) {
      return makeL1ToL2MessageBundle(this.parentCheckpoint.getL1ToL2Messages());
    }
    return L1ToL2MessageBundle.empty();
  }

  /**
   * Full-height frontier hint for the bundle append. The l1-to-l2 tree index is always subtree-aligned in the
   * transitional wiring, so the bottom `L1_TO_L2_MSG_SUBTREE_HEIGHT` levels are left-child (unread, zero) and the top
   * levels are exactly the subtree-root sibling path already captured for this block.
   */
  #getFrontierHint(): Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT> {
    return [
      ...Array.from({ length: L1_TO_L2_MSG_SUBTREE_HEIGHT }, () => Fr.ZERO),
      ...this.lastL1ToL2MessageSubtreeRootSiblingPath,
    ] as Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>;
  }

  // Returns a specific transaction proving state
  public getTxProvingState(txIndex: number) {
    return this.txs[txIndex];
  }

  public async buildHeaderFromProvingOutputs() {
    if (!this.blockRootProof?.provingOutput) {
      throw new Error('Block root rollup is not ready.');
    }

    return await buildHeaderFromCircuitOutputs(this.blockRootProof.provingOutput.inputs);
  }

  public isReadyForMergeRollup(location: TreeNodeLocation) {
    return !!this.baseOrMergeProofs.getSibling(location)?.provingOutput;
  }

  // Returns true if we have sufficient inputs to execute the block root rollup. Parity no longer gates the block root
  // (it moved to the checkpoint root), so the block root is ready once its child tx proofs land.
  public isReadyForBlockRootRollup() {
    const childProofs = this.#getChildProvingOutputsForBlockRoot();
    return childProofs.every(p => !!p);
  }

  public isComplete() {
    return !!this.blockRootProof;
  }

  public verifyState() {
    return this.parentCheckpoint.verifyState();
  }

  public getError() {
    return this.error;
  }

  public reject(reason: string) {
    this.error = reason;
    this.parentCheckpoint.reject(reason);
  }

  #getChildProvingOutputsForBlockRoot() {
    if (this.totalNumTxs === 0) {
      return [];
    }

    const rootLocation = { level: 0, index: 0 };
    // If there's only 1 tx, its base rollup proof will be stored at the root.
    return this.totalNumTxs === 1
      ? [this.baseOrMergeProofs.getNode(rootLocation)?.provingOutput]
      : this.baseOrMergeProofs.getChildren(rootLocation).map(c => c?.provingOutput);
  }

  #getGlobalVariables() {
    if (this.txs.length) {
      return this.txs[0].processedTx.globalVariables;
    }

    const constants = this.constants;

    return GlobalVariables.from({
      chainId: constants.chainId,
      version: constants.version,
      blockNumber: this.blockNumber,
      slotNumber: constants.slotNumber,
      timestamp: this.timestamp,
      coinbase: constants.coinbase,
      feeRecipient: constants.feeRecipient,
      gasFees: constants.gasFees,
    });
  }

  #getTotalFees() {
    return this.txs.reduce((acc, tx) => acc.add(tx.processedTx.txEffect.transactionFee), Fr.ZERO);
  }

  #getTotalManaUsed() {
    return this.txs.reduce((acc, tx) => acc + BigInt(tx.processedTx.gasUsed.billedGas.l2Gas), 0n);
  }
}
