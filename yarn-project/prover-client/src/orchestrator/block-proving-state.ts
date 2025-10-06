import type { SpongeBlob } from '@aztec/blob-lib';
import {
  type ARCHIVE_HEIGHT,
  type L1_TO_L2_MSG_SUBTREE_ROOT_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import { type TreeNodeLocation, UnbalancedTreeStore } from '@aztec/foundation/trees';
import { getBlockBlobFields } from '@aztec/stdlib/block';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import { type ParityPublicInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
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
import { type BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { buildHeaderFromCircuitOutputs, toProofData } from './block-building-helpers.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import type { TxProvingState } from './tx-proving-state.js';

export type ProofState<T, PROOF_LENGTH extends number> = {
  provingOutput?: PublicInputsAndRecursiveProof<T, PROOF_LENGTH>;
  isProving?: boolean;
};

/**
 * The current state of the proving schedule for a given block. Managed by ProvingState.
 * Contains the raw inputs and intermediate state to generate every constituent proof in the tree.
 */
export class BlockProvingState {
  private baseOrMergeProofs: UnbalancedTreeStore<
    ProofState<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > = new UnbalancedTreeStore(0);
  private baseParityProofs: (ProofState<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined)[] =
    Array.from({
      length: NUM_BASE_PARITY_PER_ROOT_PARITY,
    }).map(_ => undefined);
  private rootParityProof: ProofState<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH> | undefined;
  private blockRootProof:
    | ProofState<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
    | undefined;
  private builtBlockHeader: BlockHeader | undefined;
  private endSpongeBlob: SpongeBlob | undefined;
  private txs: TxProvingState[] = [];
  private isFirstBlock: boolean;
  private error: string | undefined;

  constructor(
    public readonly index: number,
    public readonly blockNumber: number,
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

  public tryStartProvingBaseParity(index: number) {
    if (this.baseParityProofs[index]?.isProving) {
      return false;
    } else {
      this.baseParityProofs[index] = { isProving: true };
      return true;
    }
  }

  // Stores a set of root parity inputs at the given index
  public setBaseParityProof(index: number, provingOutput: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    if (index >= NUM_BASE_PARITY_PER_ROOT_PARITY) {
      throw new Error(
        `Unable to set a base parity proofs at index ${index}. Expected at most ${NUM_BASE_PARITY_PER_ROOT_PARITY} proofs.`,
      );
    }
    this.baseParityProofs[index] = { provingOutput };
  }

  public tryStartProvingRootParity() {
    if (this.rootParityProof?.isProving) {
      return false;
    } else {
      this.rootParityProof = { isProving: true };
      return true;
    }
  }

  public setRootParityProof(provingOutput: PublicInputsAndRecursiveProof<ParityPublicInputs>) {
    this.rootParityProof = { provingOutput };
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

  public setBuiltBlockHeader(blockHeader: BlockHeader) {
    this.builtBlockHeader = blockHeader;
  }

  public getBuiltBlockHeader() {
    return this.builtBlockHeader;
  }

  public getGlobalVariables() {
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

  public getStartSpongeBlob() {
    return this.startSpongeBlob;
  }

  public setEndSpongeBlob(endSpongeBlob: SpongeBlob) {
    this.endSpongeBlob = endSpongeBlob;
  }

  public getEndSpongeBlob() {
    return this.endSpongeBlob;
  }

  public getBlockBlobFields() {
    return getBlockBlobFields(this.txs.map(t => t.processedTx.txEffect));
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

  public getBlockRootRollupTypeAndInputs() {
    const provingOutputs = this.#getChildProvingOutputsForBlockRoot();
    if (!provingOutputs.every(p => !!p)) {
      throw new Error('At least one child is not ready for the block root rollup.');
    }

    const previousRollups = provingOutputs.map(p => toProofData(p));

    if (this.isFirstBlock) {
      return this.#getFirstBlockRootRollupTypeAndInputs(previousRollups);
    }

    const [leftRollup, rightRollup] = previousRollups;
    if (!rightRollup) {
      return {
        rollupType: 'rollup-block-root-single-tx' satisfies CircuitName,
        inputs: new BlockRootSingleTxRollupPrivateInputs(leftRollup, this.lastArchiveSiblingPath),
      };
    } else {
      return {
        rollupType: 'rollup-block-root' satisfies CircuitName,
        inputs: new BlockRootRollupPrivateInputs([leftRollup, rightRollup], this.lastArchiveSiblingPath),
      };
    }
  }

  #getFirstBlockRootRollupTypeAndInputs([leftRollup, rightRollup]: RollupHonkProofData<TxRollupPublicInputs>[]) {
    if (!this.rootParityProof?.provingOutput) {
      throw new Error('Root parity is not ready.');
    }
    const l1ToL2Roots = toProofData(this.rootParityProof.provingOutput);

    if (!leftRollup) {
      return {
        rollupType: 'rollup-block-root-first-empty-tx' satisfies CircuitName,
        inputs: new BlockRootEmptyTxFirstRollupPrivateInputs(
          l1ToL2Roots,
          this.lastArchiveTreeSnapshot,
          this.headerOfLastBlockInPreviousCheckpoint.state,
          this.constants,
          this.startSpongeBlob,
          this.timestamp,
          this.lastL1ToL2MessageSubtreeRootSiblingPath,
          this.lastArchiveSiblingPath,
        ),
      };
    } else if (!rightRollup) {
      return {
        rollupType: 'rollup-block-root-first-single-tx' satisfies CircuitName,
        inputs: new BlockRootSingleTxFirstRollupPrivateInputs(
          l1ToL2Roots,
          leftRollup,
          this.lastL1ToL2MessageTreeSnapshot,
          this.lastL1ToL2MessageSubtreeRootSiblingPath,
          this.lastArchiveSiblingPath,
        ),
      };
    } else {
      return {
        rollupType: 'rollup-block-root-first' satisfies CircuitName,
        inputs: new BlockRootFirstRollupPrivateInputs(
          l1ToL2Roots,
          [leftRollup, rightRollup],
          this.lastL1ToL2MessageTreeSnapshot,
          this.lastL1ToL2MessageSubtreeRootSiblingPath,
          this.lastArchiveSiblingPath,
        ),
      };
    }
  }

  public getParityRootInputs() {
    const baseParityProvingOutputs = this.baseParityProofs.filter(p => !!p?.provingOutput).map(p => p!.provingOutput!);
    if (baseParityProvingOutputs.length !== this.baseParityProofs.length) {
      throw new Error('At lease one base parity is not ready.');
    }

    const children = baseParityProvingOutputs.map(p => toProofData(p));
    return new ParityRootPrivateInputs(assertLength(children, NUM_BASE_PARITY_PER_ROOT_PARITY));
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

  // Returns true if we have sufficient inputs to execute the block root rollup
  public isReadyForBlockRootRollup() {
    const childProofs = this.#getChildProvingOutputsForBlockRoot();
    return (!this.isFirstBlock || !!this.rootParityProof?.provingOutput) && childProofs.every(p => !!p);
  }

  // Returns true if we have sufficient root parity inputs to execute the root parity circuit
  public isReadyForRootParity() {
    return this.baseParityProofs.every(p => !!p?.provingOutput);
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
}
