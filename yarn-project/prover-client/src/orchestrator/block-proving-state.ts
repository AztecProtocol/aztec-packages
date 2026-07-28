import { type BlockBlobData, type BlockEndBlobData, type SpongeBlob, encodeBlockEndBlobData } from '@aztec/blob-lib';
import type {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Tuple } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { L1ToL2MessageBundle, type L1ToL2MessageSponge, makeL1ToL2MessageBundle } from '@aztec/stdlib/messaging';
import {
  BlockRollupPublicInputs,
  BlockRootNoTxsRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
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
  | { rollupType: 'rollup-block-root-no-txs'; inputs: BlockRootNoTxsRollupPrivateInputs }
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
  private error: string | undefined;

  constructor(
    public readonly index: number,
    public readonly blockNumber: BlockNumber,
    public readonly totalNumTxs: number,
    private readonly constants: CheckpointConstantData,
    private readonly timestamp: UInt64,
    public readonly lastArchiveTreeSnapshot: AppendOnlyTreeSnapshot,
    private readonly lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    // The full state reference of the previous block, before this block's bundle is appended. Feeds the msgs-only
    // block root, whose zero-tx block has no tx constants to pin the previous state.
    private readonly previousState: StateReference,
    // This block's L1-to-L2 message tree snapshot before and after its own bundle (AZIP-22 Fast Inbox). The start is
    // the previous block's end (block-merge continuity); the end is this block's own post-bundle snapshot.
    private readonly startL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    public readonly newL1ToL2MessageTreeSnapshot: AppendOnlyTreeSnapshot,
    // Full-height frontier (left-sibling path) at the block's start index, pinning the append at a compact index.
    private readonly l1ToL2MessageFrontierHint: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>,
    // This block's own real L1-to-L2 message leaves (unpadded slice).
    private readonly l1ToL2Messages: Fr[],
    // Message sponge threaded across the checkpoint's blocks (AZIP-22 Fast Inbox): the start is the previous block's
    // end sponge (empty for the first block), the end absorbs this block's own slice. Block merges assert the
    // continuity, so the end is exposed for the next block to inherit.
    private readonly startMsgSponge: L1ToL2MessageSponge,
    private readonly endMsgSponge: L1ToL2MessageSponge,
    private readonly startSpongeBlob: SpongeBlob,
    public parentCheckpoint: CheckpointProvingState,
  ) {
    this.baseOrMergeProofs = new UnbalancedTreeStore(totalNumTxs);
  }

  /** The message sponge after absorbing this block's slice; inherited by the next block as its start sponge. */
  public getEndMsgSponge(): L1ToL2MessageSponge {
    return this.endMsgSponge;
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

  /**
   * The block root variant is selected by transaction count alone. Whether this is the checkpoint's first block is
   * expressed through the start sponge values it feeds the circuit, which the checkpoint root pins to their initial
   * values for the leftmost block and the block merge pins to the previous block's end values otherwise.
   */
  public getBlockRootRollupTypeAndInputs(): BlockRootRollupTypeAndInputs {
    const provingOutputs = this.#getChildProvingOutputsForBlockRoot();
    if (!provingOutputs.every(p => !!p)) {
      throw new Error('At least one child is not ready for the block root rollup.');
    }

    const previousRollups = provingOutputs.map(p => toProofData(p));

    const messageBundle = this.#getMessageBundle();
    const frontierHint = this.#getFrontierHint();
    const startMsgSponge = this.startMsgSponge;

    const [leftRollup, rightRollup] = previousRollups;
    if (!leftRollup) {
      return {
        rollupType: 'rollup-block-root-no-txs' satisfies CircuitName,
        inputs: new BlockRootNoTxsRollupPrivateInputs(
          this.lastArchiveTreeSnapshot,
          this.previousState,
          this.constants,
          this.timestamp,
          this.startSpongeBlob,
          startMsgSponge,
          messageBundle,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    } else if (!rightRollup) {
      return {
        rollupType: 'rollup-block-root-single-tx' satisfies CircuitName,
        inputs: new BlockRootSingleTxRollupPrivateInputs(
          leftRollup,
          messageBundle,
          this.startL1ToL2MessageTreeSnapshot,
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
          this.startL1ToL2MessageTreeSnapshot,
          startMsgSponge,
          frontierHint,
          this.lastArchiveSiblingPath,
        ),
      };
    }
  }

  /**
   * The real-count message bundle this block appends (AZIP-22 Fast Inbox): the block's own message slice, inserted at
   * compact indices and absorbed into its block-root message sponge.
   */
  #getMessageBundle(): L1ToL2MessageBundle {
    return this.l1ToL2Messages.length === 0
      ? L1ToL2MessageBundle.empty()
      : makeL1ToL2MessageBundle(this.l1ToL2Messages);
  }

  /**
   * Full-height frontier hint for the bundle append: the left-sibling path at the block's compact start index, which
   * the block-root circuit re-hashes against its start snapshot root (AZIP-22 Fast Inbox).
   */
  #getFrontierHint(): Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT> {
    return this.l1ToL2MessageFrontierHint;
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
