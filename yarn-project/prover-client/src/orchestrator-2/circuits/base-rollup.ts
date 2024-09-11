import {
  MerkleTreeId,
  type ProcessedTx,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type TubeProofAndVK,
} from '@aztec/circuit-types';
import {
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  Fr,
  type GlobalVariables,
  type KernelCircuitPublicInputs,
  KernelData,
  MAX_NULLIFIERS_PER_TX,
  MembershipWitness,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NullifierLeafPreimage,
  PartialStateReference,
  PublicDataHint,
  type PublicKernelCircuitPublicInputs,
  StateDiffHints,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { type FieldsOf } from '@aztec/foundation/types';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';
import { HintsBuilder, computeFeePayerBalanceLeafSlot } from '@aztec/simulator';

import {
  getConstantRollupData,
  getMembershipWitnessFor,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  makeEmptyMembershipWitness,
  processPublicDataUpdateRequests,
  validatePartialState,
} from '../../orchestrator/block-building-helpers.js';
import { type Circuit, type OrchestratorContext } from '../types.js';

type BaseRollupNestedProof =
  | PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>
  | PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>
  | TubeProofAndVK;

export class BaseRollupCircuit implements Circuit<typeof ProvingRequestType.BASE_ROLLUP> {
  /** Resolved when updateState is called and inputs to the base rollup are computed. */
  private readonly commonInputs = promiseWithResolvers<Omit<FieldsOf<BaseRollupInputs>, 'kernelData'>>();

  /** Proof from the last kernel in the tx. */
  private readonly nestedKernelProof = promiseWithResolvers<BaseRollupNestedProof>();

  /** Snapshots from trees after executing state updates */
  private treeSnapshots?: Record<
    MerkleTreeId.NOTE_HASH_TREE | MerkleTreeId.NULLIFIER_TREE | MerkleTreeId.PUBLIC_DATA_TREE,
    AppendOnlyTreeSnapshot
  >;

  private readonly logger = createDebugLogger('aztec:prover-client:base-rollup');

  constructor(
    public readonly tx: ProcessedTx,
    public readonly globalVariables: GlobalVariables,
    public readonly index: number,
    private readonly context: OrchestratorContext,
  ) {}

  public setNestedKernelProof(proof: BaseRollupNestedProof) {
    this.nestedKernelProof.resolve(proof);
  }

  public async updateState() {
    this.logger.debug('Updating state');
    const commonInputs = await this.buildCommonInputs();
    this.logger.debug('Built common inputs');
    this.treeSnapshots = await this.getTreeSnapshots();
    this.logger.debug('Got tree snapshots');
    this.commonInputs.resolve(commonInputs);
  }

  private async getTreeSnapshots() {
    return {
      [MerkleTreeId.NOTE_HASH_TREE]: await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, this.context.db),
      [MerkleTreeId.NULLIFIER_TREE]: await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, this.context.db),
      [MerkleTreeId.PUBLIC_DATA_TREE]: await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, this.context.db),
    };
  }

  private async buildCommonInputs(): Promise<Omit<FieldsOf<BaseRollupInputs>, 'kernelData'>> {
    const {
      tx,
      globalVariables,
      context: { db },
    } = this;

    // Get trees info before any changes hit
    const constants = await getConstantRollupData(globalVariables, db);
    const start = new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, db),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, db),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, db),
    );

    // Get the subtree sibling paths for the circuit
    const noteHashSubtreeSiblingPath = padArrayEnd(
      await getSubtreeSiblingPath(MerkleTreeId.NOTE_HASH_TREE, NOTE_HASH_SUBTREE_HEIGHT, db),
      Fr.ZERO,
      NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
    );

    // Create data hint for reading fee payer initial balance in Fee Juice
    // If no fee payer is set, read hint should be empty
    // If there is already a public data write for this slot, also skip the read hint
    const hintsBuilder = new HintsBuilder(db);
    const leafSlot = computeFeePayerBalanceLeafSlot(tx.data.feePayer);
    const existingBalanceWrite = tx.data.end.publicDataUpdateRequests.find(write => write.leafSlot.equals(leafSlot));
    const feePayerFeeJuiceBalanceReadHint =
      leafSlot.isZero() || existingBalanceWrite
        ? PublicDataHint.empty()
        : await hintsBuilder.getPublicDataHint(leafSlot.toBigInt());

    // Update the note hash trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit, skipping the empty ones
    const noteHashes = tx.data.end.noteHashes;
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashes);

    // The read witnesses for a given TX should be generated before the writes of the same TX are applied.
    // All reads that refer to writes in the same tx are transient and can be simplified out.
    const txPublicDataUpdateRequestInfo = await processPublicDataUpdateRequests(tx, db);

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const {
      lowLeavesWitnessData: nullifierWitnessLeaves,
      newSubtreeSiblingPath: unpaddedNullifierSubtreeSiblingPath,
      sortedNewLeaves: sortednullifiers,
      sortedNewLeavesIndexes,
    } = await db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      tx.data.end.nullifiers.map(n => n.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );

    if (nullifierWitnessLeaves === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }

    // Extract witness objects from returned data
    const nullifierPredecessorMembershipWitnesses = padArrayEnd(
      nullifierWitnessLeaves.map(({ index, siblingPath }) =>
        MembershipWitness.fromBufferArray<typeof NULLIFIER_TREE_HEIGHT>(index, siblingPath.toBufferArray()),
      ),
      makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
      MAX_NULLIFIERS_PER_TX,
    );

    const nullifierSubtreeSiblingPath = padArrayEnd(
      unpaddedNullifierSubtreeSiblingPath.toFields(),
      Fr.ZERO,
      NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
    );

    const nullifierPredecessorPreimages = padArrayEnd(
      nullifierWitnessLeaves.map(l => l.leafPreimage as NullifierLeafPreimage),
      NullifierLeafPreimage.empty(),
      MAX_NULLIFIERS_PER_TX,
    );

    const publicDataSiblingPath = txPublicDataUpdateRequestInfo.newPublicDataSubtreeSiblingPath;

    const stateDiffHints = StateDiffHints.from({
      nullifierPredecessorPreimages,
      nullifierPredecessorMembershipWitnesses,
      sortedNullifiers: makeTuple(MAX_NULLIFIERS_PER_TX, i => Fr.fromBuffer(sortednullifiers[i])),
      sortedNullifierIndexes: makeTuple(MAX_NULLIFIERS_PER_TX, i => sortedNewLeavesIndexes[i]),
      noteHashSubtreeSiblingPath,
      nullifierSubtreeSiblingPath,
      publicDataSiblingPath,
    });

    const blockHash = tx.data.constants.historicalHeader.hash();
    const archiveRootMembershipWitness = await getMembershipWitnessFor(blockHash, MerkleTreeId.ARCHIVE, db);

    return {
      start,
      stateDiffHints,
      feePayerFeeJuiceBalanceReadHint: feePayerFeeJuiceBalanceReadHint,
      sortedPublicDataWrites: txPublicDataUpdateRequestInfo.sortedPublicDataWrites,
      sortedPublicDataWritesIndexes: txPublicDataUpdateRequestInfo.sortedPublicDataWritesIndexes,
      lowPublicDataWritesPreimages: txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages,
      lowPublicDataWritesMembershipWitnesses: txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses,
      archiveRootMembershipWitness,
      constants,
    };
  }

  @memoize
  private async getSimulationInputs() {
    const commonInputs = await this.commonInputs.promise;
    const kernelData = KernelData.withEmptyProof(this.tx.data);
    return BaseRollupInputs.from({ ...commonInputs, kernelData });
  }

  @memoize
  private async getProvingInputs() {
    const commonInputs = await this.commonInputs.promise;
    const kernelProof = await this.nestedKernelProof.promise;

    const { proof, verificationKey } = kernelProof;
    const vkIndex = getVKIndex(verificationKey);
    const vkPath = getVKSiblingPath(vkIndex);
    const kernelData = new KernelData(this.tx.data, proof, verificationKey, vkIndex, vkPath);

    return BaseRollupInputs.from({ ...commonInputs, kernelData });
  }

  @memoize
  public async simulate(): Promise<BaseOrMergeRollupPublicInputs> {
    const result = await this.context.simulator.simulate({
      type: ProvingRequestType.BASE_ROLLUP,
      inputs: await this.getSimulationInputs(),
    });

    this.validateResult(result);
    return result;
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    const result = await this.context.prover.prove({
      type: ProvingRequestType.BASE_ROLLUP,
      inputs: await this.getProvingInputs(),
    });
    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }

    this.validateResult(result.inputs);
    return result;
  }

  private validateResult(result: BaseOrMergeRollupPublicInputs) {
    validatePartialState(result.end, this.treeSnapshots!);
  }
}
