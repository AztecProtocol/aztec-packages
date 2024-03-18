import { L2Block, MerkleTreeId, ProcessedTx } from '@aztec/circuit-types';
import { ProverClient, ProvingResult } from '@aztec/circuit-types/interfaces';
import { ARCHIVE_HEIGHT, AppendOnlyTreeSnapshot, BaseOrMergeRollupPublicInputs, BaseRollupInputs, ConstantRollupData, Fr, GlobalVariables, MAX_NEW_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_READS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MembershipWitness, NOTE_HASH_SUBTREE_HEIGHT, NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage, PUBLIC_DATA_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, PUBLIC_DATA_TREE_HEIGHT, PartialStateReference, Proof, PublicDataTreeLeaf, PublicDataTreeLeafPreimage, RollupKernelCircuitPublicInputs, RollupKernelData, StateDiffHints, VK_TREE_HEIGHT } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { NativeACVMSimulator, SimulationProvider, WASMSimulator } from '@aztec/simulator';
import { MerkleTreeOperations, WorldStateSynchronizer } from '@aztec/world-state';

import * as fs from 'fs/promises';

import { SoloBlockBuilder } from '../block_builder/solo_block_builder.js';
import { ProverConfig } from '../config.js';
import { getVerificationKeys } from '../mocks/verification_keys.js';
import { EmptyRollupProver } from '../prover/empty.js';
import { RealRollupCircuitSimulator } from '../simulator/rollup.js';
import { MemoryFifo } from '@aztec/foundation/fifo';
import { randomBytes } from '@aztec/foundation/crypto';
import { Tuple, assertLength } from '@aztec/foundation/serialize';
import { assertPermutation, makeTuple } from '@aztec/foundation/array';
import { VerificationKeys } from '../mocks/verification_keys.js';
import { RollupSimulator } from '../simulator/rollup.js';


const logger = createDebugLogger('aztec:prover:proving-orchestrator');

// Denotes fields that are not used now, but will be in the future
const FUTURE_FR = new Fr(0n);
const FUTURE_NUM = 0;

// Denotes fields that should be deleted
const DELETE_FR = new Fr(0n);

/**
 * Type representing the names of the trees for the base rollup.
 */
type BaseTreeNames = 'NoteHashTree' | 'ContractTree' | 'NullifierTree' | 'PublicDataTree';
/**
 * Type representing the names of the trees.
 */
export type TreeNames = BaseTreeNames | 'L1ToL2MessageTree' | 'Archive';

enum PROVING_JOB_TYPE {
  STATE_UPDATE,
  BASE_ROLLUP,
  MERGE_ROLLUP,
  ROOT_ROLLUP
}

type ProvingJob = {
  type: PROVING_JOB_TYPE,
  operation: () => Promise<void>;
}

type BaseRollupInputData = {
  inputs: BaseRollupInputs;
  treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>;
  tx: ProcessedTx;
}

type MergeRollupInputData = {
  inputs: BaseOrMergeRollupPublicInputs;
  proof: Proof;
}

class ProvingState {
  public stateIdentifier: string;
  public baseRollupInputs: BaseRollupInputData[] = [];
  public mergeRollupInputs: MergeRollupInputData[] = [];
  public transactionsReceived = 0;
  constructor(public numTxs: number, public completionCallback: (result: ProvingResult) => void, public globalVariables: GlobalVariables) {
    this.stateIdentifier = randomBytes(32).toString('hex');
  }
}


export class ProvingOrchestrator {
  private provingState: ProvingState | undefined = undefined;
  private jobQueue: MemoryFifo<ProvingJob> = new MemoryFifo<ProvingJob>();
  private prover: EmptyRollupProver = new EmptyRollupProver();
  private simulator: RollupSimulator;
  constructor(private db: MerkleTreeOperations, private simulationProvider: SimulationProvider, protected vks: VerificationKeys) {
    this.simulator = new RealRollupCircuitSimulator(simulationProvider);
  }

  public async proveBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newModelL1ToL2Messages: Fr[], // TODO(#4492): Rename this when purging the old inbox
    newL1ToL2Messages: Fr[], // TODO(#4492): Nuke this when purging the old inbox
  ): Promise<[L2Block, Proof]> {
    const blockBuilder = new SoloBlockBuilder(
      this.db,
      getVerificationKeys(),
      this.simulator,
      new EmptyRollupProver(),
    );
    return await blockBuilder.buildL2Block(globalVariables, txs, newModelL1ToL2Messages, newL1ToL2Messages);
  }

  startNewBlock(numTxs: number, completionCallback: (result: ProvingResult) => void, globalVariables: GlobalVariables): void {
    this.provingState = new ProvingState(numTxs, completionCallback, globalVariables);
  }

  addNewTx(tx: ProcessedTx): void {
    if (!this.provingState) {
      throw new Error(`Invalid proving state, call startNewBlock before adding transactions`);
    }

    // we start this transaction off by enqueueing it's state updates
    const job: ProvingJob = {
      type: PROVING_JOB_TYPE.STATE_UPDATE,
      operation: () => this.prepareBaseRollupInputs(this.provingState!.transactionsReceived++, tx, this.provingState!.globalVariables, this.provingState!.stateIdentifier)
    }
    this.jobQueue.put(job);
  }



  private async prepareBaseRollupInputs(index: number, tx: ProcessedTx, globalVariables: GlobalVariables, stateIdentifier: string) {
    const inputs = await this.buildBaseRollupInput(tx, globalVariables);
    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await this.getTreeSnapshot(id) };
      },
    );
    const treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot> = new Map(
      (await Promise.all(promises)).map(obj => [obj.key, obj.value]),
    );
    const baseRollupInputData: BaseRollupInputData = {
      inputs,
      tx,
      treeSnapshots,
    }
    if (this.provingState && this.provingState.stateIdentifier === stateIdentifier) {
      this.provingState.baseRollupInputs[index] = baseRollupInputData;

    }    
  }

  // Builds the base rollup inputs, updating the contract, nullifier, and data trees in the process
  protected async buildBaseRollupInput(tx: ProcessedTx, globalVariables: GlobalVariables) {
    // Get trees info before any changes hit
    const constants = await this.getConstantRollupData(globalVariables);
    const start = new PartialStateReference(
      await this.getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE),
      await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE),
      await this.getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE),
    );

    // Get the subtree sibling paths for the circuit
    const noteHashSubtreeSiblingPathArray = await this.getSubtreeSiblingPath(
      MerkleTreeId.NOTE_HASH_TREE,
      NOTE_HASH_SUBTREE_HEIGHT,
    );

    const noteHashSubtreeSiblingPath = makeTuple(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < noteHashSubtreeSiblingPathArray.length ? noteHashSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    // Update the note hash trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit, skipping the empty ones
    const newNoteHashes = tx.data.combinedData.newNoteHashes.map(x => x.value.toBuffer());
    await this.db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, newNoteHashes);

    // The read witnesses for a given TX should be generated before the writes of the same TX are applied.
    // All reads that refer to writes in the same tx are transient and can be simplified out.
    const txPublicDataReadsInfo = await this.getPublicDataReadsInfo(tx);
    const txPublicDataUpdateRequestInfo = await this.processPublicDataUpdateRequests(tx);

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const {
      lowLeavesWitnessData: nullifierWitnessLeaves,
      newSubtreeSiblingPath: newNullifiersSubtreeSiblingPath,
      sortedNewLeaves: sortedNewNullifiers,
      sortedNewLeavesIndexes,
    } = await this.db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      tx.data.combinedData.newNullifiers.map(sideEffectLinkedToNoteHash => sideEffectLinkedToNoteHash.value.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    if (nullifierWitnessLeaves === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }

    // Extract witness objects from returned data
    const nullifierPredecessorMembershipWitnessesWithoutPadding: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>[] =
      nullifierWitnessLeaves.map(l =>
        MembershipWitness.fromBufferArray(l.index, assertLength(l.siblingPath.toBufferArray(), NULLIFIER_TREE_HEIGHT)),
      );

    const nullifierSubtreeSiblingPathArray = newNullifiersSubtreeSiblingPath.toFields();

    const nullifierSubtreeSiblingPath = makeTuple(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < nullifierSubtreeSiblingPathArray.length ? nullifierSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    const publicDataSiblingPath = txPublicDataUpdateRequestInfo.newPublicDataSubtreeSiblingPath;

    const stateDiffHints = StateDiffHints.from({
      nullifierPredecessorPreimages: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, i =>
        i < nullifierWitnessLeaves.length
          ? (nullifierWitnessLeaves[i].leafPreimage as NullifierLeafPreimage)
          : NullifierLeafPreimage.empty(),
      ),
      nullifierPredecessorMembershipWitnesses: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, i =>
        i < nullifierPredecessorMembershipWitnessesWithoutPadding.length
          ? nullifierPredecessorMembershipWitnessesWithoutPadding[i]
          : this.makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
      ),
      sortedNullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, i => Fr.fromBuffer(sortedNewNullifiers[i])),
      sortedNullifierIndexes: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, i => sortedNewLeavesIndexes[i]),
      noteHashSubtreeSiblingPath,
      nullifierSubtreeSiblingPath,
      publicDataSiblingPath,
    });

    const blockHash = tx.data.constants.historicalHeader.hash();
    const archiveRootMembershipWitness = await this.getMembershipWitnessFor(
      blockHash,
      MerkleTreeId.ARCHIVE,
      ARCHIVE_HEIGHT,
    );

    return BaseRollupInputs.from({
      kernelData: this.getKernelDataFor(tx),
      start,
      stateDiffHints,

      sortedPublicDataWrites: txPublicDataUpdateRequestInfo.sortedPublicDataWrites,
      sortedPublicDataWritesIndexes: txPublicDataUpdateRequestInfo.sortedPublicDataWritesIndexes,
      lowPublicDataWritesPreimages: txPublicDataUpdateRequestInfo.lowPublicDataWritesPreimages,
      lowPublicDataWritesMembershipWitnesses: txPublicDataUpdateRequestInfo.lowPublicDataWritesMembershipWitnesses,
      publicDataReadsPreimages: txPublicDataReadsInfo.newPublicDataReadsPreimages,
      publicDataReadsMembershipWitnesses: txPublicDataReadsInfo.newPublicDataReadsWitnesses,

      archiveRootMembershipWitness,

      constants,
    });
  }

  protected async getConstantRollupData(globalVariables: GlobalVariables): Promise<ConstantRollupData> {
    return ConstantRollupData.from({
      baseRollupVkHash: DELETE_FR,
      mergeRollupVkHash: DELETE_FR,
      privateKernelVkTreeRoot: FUTURE_FR,
      publicKernelVkTreeRoot: FUTURE_FR,
      lastArchive: await this.getTreeSnapshot(MerkleTreeId.ARCHIVE),
      globalVariables,
    });
  }

  protected async getTreeSnapshot(id: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(id);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }

  protected getKernelDataFor(tx: ProcessedTx): RollupKernelData {
    const inputs = new RollupKernelCircuitPublicInputs(
      tx.data.aggregationObject,
      tx.data.combinedData,
      tx.data.constants,
    );
    return new RollupKernelData(
      inputs,
      tx.proof,

      // VK for the kernel circuit
      this.vks.privateKernelCircuit,

      // MembershipWitness for a VK tree to be implemented in the future
      FUTURE_NUM,
      assertLength(Array(VK_TREE_HEIGHT).fill(FUTURE_FR), VK_TREE_HEIGHT),
    );
  }

  protected makeEmptyMembershipWitness<N extends number>(height: N) {
    return new MembershipWitness(
      height,
      0n,
      makeTuple(height, () => Fr.ZERO),
    );
  }

  protected async getPublicDataReadsInfo(tx: ProcessedTx) {
    const newPublicDataReadsWitnesses: Tuple<
      MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
      typeof MAX_PUBLIC_DATA_READS_PER_TX
    > = makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, () => MembershipWitness.empty(PUBLIC_DATA_TREE_HEIGHT, 0n));

    const newPublicDataReadsPreimages: Tuple<PublicDataTreeLeafPreimage, typeof MAX_PUBLIC_DATA_READS_PER_TX> =
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, () => PublicDataTreeLeafPreimage.empty());

    for (const i in tx.data.validationRequests.publicDataReads) {
      const leafSlot = tx.data.validationRequests.publicDataReads[i].leafSlot.value;
      const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
      if (!lowLeafResult) {
        throw new Error(`Public data tree should have one initial leaf`);
      }
      const preimage = await this.db.getLeafPreimage(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
      const path = await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
      newPublicDataReadsWitnesses[i] = new MembershipWitness(
        PUBLIC_DATA_TREE_HEIGHT,
        BigInt(lowLeafResult.index),
        path.toTuple<typeof PUBLIC_DATA_TREE_HEIGHT>(),
      );
      newPublicDataReadsPreimages[i] = preimage! as PublicDataTreeLeafPreimage;
    }
    return {
      newPublicDataReadsWitnesses,
      newPublicDataReadsPreimages,
    };
  }

  protected async processPublicDataUpdateRequests(tx: ProcessedTx) {
    const combinedPublicDataUpdateRequests = tx.data.combinedData.publicDataUpdateRequests.map(updateRequest => {
      return new PublicDataTreeLeaf(updateRequest.leafSlot, updateRequest.newValue);
    });
    const { lowLeavesWitnessData, newSubtreeSiblingPath, sortedNewLeaves, sortedNewLeavesIndexes } =
      await this.db.batchInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        combinedPublicDataUpdateRequests.map(x => x.toBuffer()),
        // TODO(#3675) remove oldValue from update requests
        PUBLIC_DATA_SUBTREE_HEIGHT,
      );

    if (lowLeavesWitnessData === undefined) {
      throw new Error(`Could not craft public data batch insertion proofs`);
    }

    const sortedPublicDataWrites = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, i => {
      return PublicDataTreeLeaf.fromBuffer(sortedNewLeaves[i]);
    });

    const sortedPublicDataWritesIndexes = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, i => {
      return sortedNewLeavesIndexes[i];
    });

    const subtreeSiblingPathAsFields = newSubtreeSiblingPath.toFields();
    const newPublicDataSubtreeSiblingPath = makeTuple(PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, i => {
      return subtreeSiblingPathAsFields[i];
    });

    const lowPublicDataWritesMembershipWitnesses: Tuple<
      MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    > = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, i => {
      const witness = lowLeavesWitnessData[i];
      return MembershipWitness.fromBufferArray(
        witness.index,
        assertLength(witness.siblingPath.toBufferArray(), PUBLIC_DATA_TREE_HEIGHT),
      );
    });

    const lowPublicDataWritesPreimages: Tuple<
      PublicDataTreeLeafPreimage,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    > = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, i => {
      return lowLeavesWitnessData[i].leafPreimage as PublicDataTreeLeafPreimage;
    });

    // validate that the sortedPublicDataWrites and sortedPublicDataWritesIndexes are in the correct order
    // otherwise it will just fail in the circuit
    assertPermutation(combinedPublicDataUpdateRequests, sortedPublicDataWrites, sortedPublicDataWritesIndexes, (a, b) =>
      a.equals(b),
    );

    return {
      lowPublicDataWritesPreimages,
      lowPublicDataWritesMembershipWitnesses,
      newPublicDataSubtreeSiblingPath,
      sortedPublicDataWrites,
      sortedPublicDataWritesIndexes,
    };
  }

  protected async getSubtreeSiblingPath(treeId: MerkleTreeId, subtreeHeight: number): Promise<Fr[]> {
    const nextAvailableLeafIndex = await this.db.getTreeInfo(treeId).then(t => t.size);
    const fullSiblingPath = await this.db.getSiblingPath(treeId, nextAvailableLeafIndex);

    // Drop the first subtreeHeight items since we only care about the path to the subtree root
    return fullSiblingPath.getSubtreeSiblingPath(subtreeHeight).toFields();
  }

  // Scan a tree searching for a specific value and return a membership witness proof for it
  protected async getMembershipWitnessFor<N extends number>(
    value: Fr,
    treeId: MerkleTreeId,
    height: N,
  ): Promise<MembershipWitness<N>> {
    // If this is an empty tx, then just return zeroes
    if (value.isZero()) {
      return this.makeEmptyMembershipWitness(height);
    }

    const index = await this.db.findLeafIndex(treeId, value.toBuffer());
    if (index === undefined) {
      throw new Error(`Leaf with value ${value} not found in tree ${MerkleTreeId[treeId]}`);
    }
    const path = await this.db.getSiblingPath(treeId, index);
    return new MembershipWitness(height, index, assertLength(path.toFields(), height));
  }

  protected async executeBaseRollupCircuit(
    tx: ProcessedTx,
    inputs: BaseRollupInputs,
    treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    logger(`Running base rollup for ${tx.hash}`);
    const rollupOutput = await this.simulator.baseRollupCircuit(inputs);
    this.validatePartialState(rollupOutput.end, treeSnapshots);
    const proof = await this.prover.getBaseRollupProof(inputs, rollupOutput);
    return [rollupOutput, proof];
  }

  protected validatePartialState(
    partialState: PartialStateReference,
    treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ) {
    this.validateSimulatedTree(
      treeSnapshots.get(MerkleTreeId.NOTE_HASH_TREE)!,
      partialState.noteHashTree,
      'NoteHashTree',
    );
    this.validateSimulatedTree(
      treeSnapshots.get(MerkleTreeId.NULLIFIER_TREE)!,
      partialState.nullifierTree,
      'NullifierTree',
    );
    this.validateSimulatedTree(
      treeSnapshots.get(MerkleTreeId.PUBLIC_DATA_TREE)!,
      partialState.publicDataTree,
      'PublicDataTree',
    );
  }

  // Helper for comparing two trees snapshots
  protected validateSimulatedTree(
    localTree: AppendOnlyTreeSnapshot,
    simulatedTree: AppendOnlyTreeSnapshot,
    name: TreeNames,
    label?: string,
  ) {
    if (!simulatedTree.root.toBuffer().equals(localTree.root.toBuffer())) {
      throw new Error(`${label ?? name} tree root mismatch (local ${localTree.root}, simulated ${simulatedTree.root})`);
    }
    if (simulatedTree.nextAvailableLeafIndex !== localTree.nextAvailableLeafIndex) {
      throw new Error(
        `${label ?? name} tree next available leaf index mismatch (local ${
          localTree.nextAvailableLeafIndex
        }, simulated ${simulatedTree.nextAvailableLeafIndex})`,
      );
    }
  }
}