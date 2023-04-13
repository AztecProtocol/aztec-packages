import {
  AppendOnlyTreeSnapshot,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  CircuitsWasm,
  ConstantBaseRollupData,
  MembershipWitness,
  MergeRollupInputs,
  NULLIFIER_TREE_HEIGHT,
  NullifierLeafPreimage,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
  PreviousKernelData,
  PreviousRollupData,
  ROLLUP_VK_TREE_HEIGHT,
  RollupTypes,
  RootRollupInputs,
  RootRollupPublicInputs,
  UInt8Vector,
  VK_TREE_HEIGHT,
  VerificationKey,
} from '@aztec/circuits.js';
import { computeContractLeaf } from '@aztec/circuits.js/abis';
import { Fr, createDebugLogger, toBigIntBE } from '@aztec/foundation';
import { LeafData, SiblingPath } from '@aztec/merkle-tree';
import { ContractData, L2Block, Tx } from '@aztec/types';
import { MerkleTreeId, MerkleTreeOperations } from '@aztec/world-state';
import chunk from 'lodash.chunk';
import flatMap from 'lodash.flatmap';
import times from 'lodash.times';
import { VerificationKeys } from '../mocks/verification_keys.js';
import { Proof, Prover } from '../prover/index.js';
import { Simulator } from '../simulator/index.js';

import { BlockBuilder } from './index.js';

const frToBigInt = (fr: Fr) => toBigIntBE(fr.toBuffer());
const bigintToFr = (num: bigint) => new Fr(num);
const bigintToNum = (num: bigint) => Number(num);

// Denotes fields that are not used now, but will be in the future
const FUTURE_FR = new Fr(0n);
const FUTURE_NUM = 0;

// Denotes fields that should be deleted
const DELETE_FR = new Fr(0n);
const DELETE_NUM = 0;

/**
 * All of the data required for the circuit compute and verify nullifiers
 */
export interface LowNullifierWitnessData {
  /**
   * Preimage of the low nullifier that proves non membership
   */
  preimage: NullifierLeafPreimage;
  /**
   * Sibling path to prove membership of low nullifier
   */
  siblingPath: SiblingPath;
  /**
   * The index of low nullifier
   */
  index: bigint;
}

export class CircuitBlockBuilder implements BlockBuilder {
  constructor(
    protected db: MerkleTreeOperations,
    protected vks: VerificationKeys,
    protected simulator: Simulator,
    protected prover: Prover,
    protected debug = createDebugLogger('aztec:sequencer'),
  ) {}

  public async buildL2Block(blockNumber: number, txs: Tx[]): Promise<[L2Block, UInt8Vector]> {
    const [
      startPrivateDataTreeSnapshot,
      startNullifierTreeSnapshot,
      startContractTreeSnapshot,
      startTreeOfHistoricPrivateDataTreeRootsSnapshot,
      startTreeOfHistoricContractTreeRootsSnapshot,
    ] = await Promise.all(
      [
        MerkleTreeId.DATA_TREE,
        MerkleTreeId.NULLIFIER_TREE,
        MerkleTreeId.CONTRACT_TREE,
        MerkleTreeId.DATA_TREE_ROOTS_TREE,
        MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
      ].map(tree => this.getTreeSnapshot(tree)),
    );

    // We fill the tx batch with empty txs, we process only one tx at a time for now
    const [circuitsOutput, proof] = await this.runCircuits(txs);

    const {
      endPrivateDataTreeSnapshot,
      endNullifierTreeSnapshot,
      endContractTreeSnapshot,
      endTreeOfHistoricPrivateDataTreeRootsSnapshot,
      endTreeOfHistoricContractTreeRootsSnapshot,
    } = circuitsOutput;

    // Collect all new nullifiers, commitments, and contracts from all txs in this block
    const wasm = await CircuitsWasm.get();
    const newNullifiers = flatMap(txs, tx => tx.data.end.newNullifiers);
    const newCommitments = flatMap(txs, tx => tx.data.end.newCommitments);
    const newContracts = flatMap(txs, tx => tx.data.end.newContracts).map(cd => computeContractLeaf(wasm, cd));
    const newContractData = flatMap(txs, tx => tx.data.end.newContracts).map(
      n => new ContractData(n.contractAddress, n.portalContractAddress),
    );

    const l2Block = L2Block.fromFields({
      number: blockNumber,
      startPrivateDataTreeSnapshot,
      endPrivateDataTreeSnapshot,
      startNullifierTreeSnapshot,
      endNullifierTreeSnapshot,
      startContractTreeSnapshot,
      endContractTreeSnapshot,
      startTreeOfHistoricPrivateDataTreeRootsSnapshot,
      endTreeOfHistoricPrivateDataTreeRootsSnapshot,
      startTreeOfHistoricContractTreeRootsSnapshot,
      endTreeOfHistoricContractTreeRootsSnapshot,
      newCommitments,
      newNullifiers,
      newContracts,
      newContractData,
    });

    return [l2Block, proof];
  }

  protected async getTreeSnapshot(id: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(id);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }

  protected async runCircuits(txs: Tx[]): Promise<[RootRollupPublicInputs, Proof]> {
    // Check that the length of the array of txs is a power of two
    // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
    if (txs.length < 4 || (txs.length & (txs.length - 1)) !== 0) {
      throw new Error(`Length of txs for the block should be a power of two and at least four (got ${txs.length})`);
    }

    // Run the base rollup circuits for the txs
    const baseRollupOutputs: [BaseOrMergeRollupPublicInputs, Proof][] = [];
    for (const pair of chunk(txs, 2)) {
      const [tx1, tx2] = pair;
      baseRollupOutputs.push(await this.baseRollupCircuit(tx1, tx2));
    }

    // Run merge rollups in layers until we have only two outputs
    let mergeRollupInputs: [BaseOrMergeRollupPublicInputs, Proof][] = baseRollupOutputs;
    let mergeRollupOutputs: [BaseOrMergeRollupPublicInputs, Proof][] = [];
    while (mergeRollupInputs.length > 2) {
      for (const pair of chunk(mergeRollupInputs, 2)) {
        const [r1, r2] = pair;
        mergeRollupOutputs.push(await this.mergeRollupCircuit(r1, r2));
      }
      mergeRollupInputs = mergeRollupOutputs;
      mergeRollupOutputs = [];
    }

    // Run the root rollup with the last two merge rollups (or base, if no merge layers)
    const [mergeOutputLeft, mergeOutputRight] = mergeRollupInputs;
    return this.rootRollupCircuit(mergeOutputLeft, mergeOutputRight);
  }

  protected async baseRollupCircuit(tx1: Tx, tx2: Tx): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    this.debug(`Running base rollup for ${await tx1.getTxHash()} ${await tx2.getTxHash()}`);
    const rollupInput = await this.buildBaseRollupInput(tx1, tx2);
    const rollupOutput = await this.simulator.baseRollupCircuit(rollupInput);
    await this.validateTrees(rollupOutput);
    const proof = await this.prover.getBaseRollupProof(rollupInput, rollupOutput);
    return [rollupOutput, proof];
  }

  protected async mergeRollupCircuit(
    left: [BaseOrMergeRollupPublicInputs, Proof],
    right: [BaseOrMergeRollupPublicInputs, Proof],
  ): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    const vk = this.getVerificationKey(left[0].rollupType);
    const mergeInputs = new MergeRollupInputs([
      this.getPreviousRollupDataFromPublicInputs(left[0], left[1], vk),
      this.getPreviousRollupDataFromPublicInputs(right[0], right[1], vk),
    ]);

    this.debug(`Running merge rollup circuit`);
    const output = await this.simulator.mergeRollupCircuit(mergeInputs);
    const proof = await this.prover.getMergeRollupProof(mergeInputs, output);
    return [output, proof];
  }

  protected getVerificationKey(type: RollupTypes) {
    switch (type) {
      case RollupTypes.Base:
        return this.vks.baseRollupCircuit;
      case RollupTypes.Merge:
        return this.vks.mergeRollupCircuit;
      default:
        throw new Error(`No verification key available for ${type}`);
    }
  }

  protected async rootRollupCircuit(
    left: [BaseOrMergeRollupPublicInputs, Proof],
    right: [BaseOrMergeRollupPublicInputs, Proof],
  ): Promise<[RootRollupPublicInputs, Proof]> {
    this.debug(`Running root rollup circuit`);
    const rootInput = await this.getRootRollupInput(...left, ...right);

    // Simulate and get proof for the root circuit
    const rootOutput = await this.simulator.rootRollupCircuit(rootInput);
    const rootProof = await this.prover.getRootRollupProof(rootInput, rootOutput);

    // Update the root trees with the latest data and contract tree roots,
    // and validate them against the output of the root circuit simulation
    this.debug(`Updating and validating root trees`);
    await this.updateRootTrees();
    await this.validateRootOutput(rootOutput);

    return [rootOutput, rootProof];
  }

  // Updates our roots trees with the new generated trees after the rollup updates
  protected async updateRootTrees() {
    for (const [newTree, rootTree] of [
      [MerkleTreeId.DATA_TREE, MerkleTreeId.DATA_TREE_ROOTS_TREE],
      [MerkleTreeId.CONTRACT_TREE, MerkleTreeId.CONTRACT_TREE_ROOTS_TREE],
    ] as const) {
      const newTreeInfo = await this.db.getTreeInfo(newTree);
      await this.db.appendLeaves(rootTree, [newTreeInfo.root]);
    }
  }

  // Validate that the new roots we calculated from manual insertions match the outputs of the simulation
  protected async validateTrees(rollupOutput: BaseOrMergeRollupPublicInputs | RootRollupPublicInputs) {
    await Promise.all([
      this.validateTree(rollupOutput, MerkleTreeId.CONTRACT_TREE, 'Contract'),
      this.validateTree(rollupOutput, MerkleTreeId.DATA_TREE, 'PrivateData'),
      this.validateTree(rollupOutput, MerkleTreeId.NULLIFIER_TREE, 'Nullifier'),
    ]);
  }

  // Validate that the roots of all local trees match the output of the root circuit simulation
  protected async validateRootOutput(rootOutput: RootRollupPublicInputs) {
    await Promise.all([
      this.validateTrees(rootOutput),
      this.validateRootTree(rootOutput, MerkleTreeId.CONTRACT_TREE_ROOTS_TREE, 'Contract'),
      this.validateRootTree(rootOutput, MerkleTreeId.DATA_TREE_ROOTS_TREE, 'PrivateData'),
    ]);
  }

  // Helper for validating a roots tree against a circuit simulation output
  protected async validateRootTree(
    rootOutput: RootRollupPublicInputs,
    treeId: MerkleTreeId,
    name: 'Contract' | 'PrivateData',
  ) {
    const localTree = await this.getTreeSnapshot(treeId);
    const simulatedTree = rootOutput[`endTreeOfHistoric${name}TreeRootsSnapshot`];
    this.validateSimulatedTree(localTree, simulatedTree, name, `Roots ${name}`);
  }

  // Helper for validating a non-roots tree against a circuit simulation output
  protected async validateTree(
    output: BaseOrMergeRollupPublicInputs | RootRollupPublicInputs,
    treeId: MerkleTreeId,
    name: 'PrivateData' | 'Contract' | 'Nullifier',
  ) {
    const localTree = await this.getTreeSnapshot(treeId);
    const simulatedTree = output[`end${name}TreeSnapshot`];
    this.validateSimulatedTree(localTree, simulatedTree, name);
  }

  // Helper for comparing two trees snapshots
  protected validateSimulatedTree(
    localTree: AppendOnlyTreeSnapshot,
    simulatedTree: AppendOnlyTreeSnapshot,
    name: string,
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

  // Builds the inputs for the root rollup circuit, without making any changes to trees
  protected async getRootRollupInput(
    rollupOutputLeft: BaseOrMergeRollupPublicInputs,
    rollupProofLeft: Proof,
    rollupOutputRight: BaseOrMergeRollupPublicInputs,
    rollupProofRight: Proof,
  ) {
    const vk = this.getVerificationKey(rollupOutputLeft.rollupType);
    const previousRollupData: RootRollupInputs['previousRollupData'] = [
      this.getPreviousRollupDataFromPublicInputs(rollupOutputLeft, rollupProofLeft, vk),
      this.getPreviousRollupDataFromPublicInputs(rollupOutputRight, rollupProofRight, vk),
    ];

    const getRootTreeSiblingPath = async (treeId: MerkleTreeId) => {
      // TODO: Synchronize these operations into the tree db to avoid race conditions
      const { size } = await this.db.getTreeInfo(treeId);
      // TODO: Check for off-by-one errors
      const path = await this.db.getSiblingPath(treeId, size);
      return path.data.map(b => Fr.fromBuffer(b));
    };

    const newHistoricContractDataTreeRootSiblingPath = await getRootTreeSiblingPath(
      MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
    );
    const newHistoricPrivateDataTreeRootSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.DATA_TREE_ROOTS_TREE);

    return RootRollupInputs.from({
      previousRollupData,
      newHistoricContractDataTreeRootSiblingPath,
      newHistoricPrivateDataTreeRootSiblingPath,
    });
  }

  protected getPreviousRollupDataFromPublicInputs(
    rollupOutput: BaseOrMergeRollupPublicInputs,
    rollupProof: Proof,
    vk: VerificationKey,
  ) {
    return new PreviousRollupData(
      rollupOutput,
      rollupProof,
      vk,

      // MembershipWitness for a VK tree to be implemented in the future
      FUTURE_NUM,
      new MembershipWitness(ROLLUP_VK_TREE_HEIGHT, FUTURE_NUM, Array(ROLLUP_VK_TREE_HEIGHT).fill(FUTURE_FR)),
    );
  }

  protected getKernelDataFor(tx: Tx) {
    return new PreviousKernelData(
      tx.data,
      tx.proof,

      // VK for the kernel circuit
      this.vks.kernelCircuit,

      // MembershipWitness for a VK tree to be implemented in the future
      FUTURE_NUM,
      Array(VK_TREE_HEIGHT).fill(FUTURE_FR),
    );
  }

  // Scan a tree searching for a specific value and return a membership witness proof for it
  protected async getMembershipWitnessFor<N extends number>(
    value: Fr,
    treeId: MerkleTreeId,
    height: N,
  ): Promise<MembershipWitness<N>> {
    // If this is an empty tx, then just return zeroes
    if (value.value === 0n) return this.makeEmptyMembershipWitness(height);

    const index = await this.db.findLeafIndex(treeId, value.toBuffer());
    if (index === undefined) {
      throw new Error(`Leaf with value ${value} not found in tree ${treeId}`);
    }
    const path = await this.db.getSiblingPath(treeId, index);
    // TODO: Check conversion from bigint to number
    return new MembershipWitness(
      height,
      Number(index),
      path.data.map(b => Fr.fromBuffer(b)),
    );
  }

  protected getContractMembershipWitnessFor(tx: Tx) {
    return this.getMembershipWitnessFor(
      tx.data.constants.oldTreeRoots.contractTreeRoot,
      MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
      CONTRACT_TREE_ROOTS_TREE_HEIGHT,
    );
  }

  protected getDataMembershipWitnessFor(tx: Tx) {
    return this.getMembershipWitnessFor(
      tx.data.constants.oldTreeRoots.privateDataTreeRoot,
      MerkleTreeId.DATA_TREE_ROOTS_TREE,
      PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
    );
  }

  protected async getConstantBaseRollupData(): Promise<ConstantBaseRollupData> {
    return ConstantBaseRollupData.from({
      baseRollupVkHash: DELETE_FR,
      mergeRollupVkHash: DELETE_FR,
      privateKernelVkTreeRoot: FUTURE_FR,
      publicKernelVkTreeRoot: FUTURE_FR,
      startTreeOfHistoricContractTreeRootsSnapshot: await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE),
      startTreeOfHistoricPrivateDataTreeRootsSnapshot: await this.getTreeSnapshot(MerkleTreeId.DATA_TREE_ROOTS_TREE),
      treeOfHistoricL1ToL2MsgTreeRootsSnapshot: new AppendOnlyTreeSnapshot(DELETE_FR, DELETE_NUM),
    });
  }

  protected async getLowNullifierInfo(nullifier: Fr) {
    // Return empty nullifier info for an empty tx
    if (nullifier.value === 0n) {
      return {
        index: 0,
        leafPreimage: new NullifierLeafPreimage(new Fr(0n), new Fr(0n), 0),
        witness: this.makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
      };
    }

    const tree = MerkleTreeId.NULLIFIER_TREE;
    const prevValueIndex = await this.db.getPreviousValueIndex(tree, frToBigInt(nullifier));
    const prevValueInfo = await this.db.getLeafData(tree, prevValueIndex.index);
    if (!prevValueInfo) throw new Error(`Nullifier tree should have one initial leaf`);
    const prevValueSiblingPath = await this.db.getSiblingPath(tree, BigInt(prevValueIndex.index));

    return {
      index: prevValueIndex,
      leafPreimage: new NullifierLeafPreimage(
        bigintToFr(prevValueInfo.value),
        bigintToFr(prevValueInfo.nextValue),
        bigintToNum(prevValueInfo.nextIndex),
      ),
      witness: new MembershipWitness(
        NULLIFIER_TREE_HEIGHT,
        prevValueIndex.index,
        prevValueSiblingPath.data.map(b => Fr.fromBuffer(b)),
      ),
    };
  }

  protected async getSubtreeSiblingPath(treeId: MerkleTreeId, subtreeHeight: number): Promise<Fr[]> {
    // Get sibling path to the last leaf we inserted
    const lastLeafIndex = (await this.db.getTreeInfo(treeId).then(t => t.size)) - 1n;
    const fullSiblingPath = await this.db.getSiblingPath(treeId, lastLeafIndex);

    // Drop the first subtreeHeight items since we only care about the path to the subtree root
    return fullSiblingPath.data.slice(subtreeHeight).map(b => Fr.fromBuffer(b));
  }

  /**
   * Each base rollup needs to provide non membership / inclusion proofs for each of the nullifier.
   * This method will return membership proofs and perform partial node updates that will
   * allow the circuit to incrementally update the tree and perform a batch insertion.
   *
   * This offers massive circuit performance savings over doing incremental insertions.
   *
   * A description of the algorithm can be found here: https://colab.research.google.com/drive/1A0gizduSi4FIiIJZ8OylwIpO9-OTqV-R
   *
   * WARNING: This function has side effects, it will insert values into the tree.
   *
   * Assumptions:
   * 1. There are 8 nullifiers provided and they are either unique or empty. (denoted as 0)
   * 2. If kc 0 has 1 nullifier, and kc 1 has 3 nullifiers the layout will assume to be the sparse
   *   nullifier layout: [kc0-0, 0, 0, 0, kc1-0, kc1-1, kc1-2, 0]
   *
   * TODO: this implementation will change once the zero value is changed from h(0,0,0). Changes incoming over the next sprint
   * @param leaves Values to insert into the tree
   * @returns
   */
  public async performBaseRollupBatchInsertionProofs(leaves: Buffer[]): Promise<LowNullifierWitnessData[] | undefined> {
    // Keep track of touched low nullifiers
    const touched = new Map<number, bigint[]>();

    // Accumulators
    const lowNullifierWitnesses: LowNullifierWitnessData[] = [];
    const pendingInsertionSubtree: NullifierLeafPreimage[] = [];

    // Start info
    const dbInfo = await this.db.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
    const startInsertionIndex: bigint = dbInfo.size;

    // Prefill empty values
    const zeroPreimage: NullifierLeafPreimage = new NullifierLeafPreimage(new Fr(0n), new Fr(0n), 0);
    const emptySP = new SiblingPath();
    emptySP.data = Array(dbInfo.depth).fill(
      Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
    );
    const emptyWitness: LowNullifierWitnessData = {
      preimage: NullifierLeafPreimage.empty(),
      index: 0n,
      siblingPath: emptySP,
    };

    // Get insertion path for each leaf
    for (let i = 0; i < leaves.length; i++) {
      const newValue = toBigIntBE(leaves[i]);

      // Keep space and just insert zero values
      if (newValue === 0n) {
        pendingInsertionSubtree.push(zeroPreimage);
        lowNullifierWitnesses.push(emptyWitness);
        continue;
      }

      const indexOfPrevious = await this.db.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, newValue);

      // If a touched node has a value that is less greater than the current value
      const prevNodes = touched.get(indexOfPrevious.index);
      if (prevNodes && prevNodes.some(v => v < newValue)) {
        // check the pending low nullifiers for a low nullifier that works
        // This is the case where the next value is less than the pending
        for (let j = 0; j < pendingInsertionSubtree.length; j++) {
          if (pendingInsertionSubtree[j].leafValue.isZero()) continue;

          if (
            pendingInsertionSubtree[j].leafValue.value < newValue &&
            (pendingInsertionSubtree[j].nextValue.value > newValue || pendingInsertionSubtree[j].nextValue.isZero())
          ) {
            // add the new value to the pending low nullifiers
            const currentLeafLowNullifier = new NullifierLeafPreimage(
              new Fr(newValue),
              pendingInsertionSubtree[j].nextValue,
              Number(pendingInsertionSubtree[j].nextIndex),
            );

            pendingInsertionSubtree.push(currentLeafLowNullifier);

            // Update the pending low nullifier to point at the new value
            pendingInsertionSubtree[j].nextValue = new Fr(newValue);
            pendingInsertionSubtree[j].nextIndex = Number(startInsertionIndex) + i;

            break;
          }
        }

        // Any node updated in this space will need to calculate its low nullifier from a previously inserted value
        lowNullifierWitnesses.push(emptyWitness);
      } else {
        // Update the touched mapping
        if (prevNodes) {
          prevNodes.push(newValue);
          touched.set(indexOfPrevious.index, prevNodes);
        } else {
          touched.set(indexOfPrevious.index, [newValue]);
        }

        // get the low nullifier
        const lowNullifier = await this.db.getLeafData(MerkleTreeId.NULLIFIER_TREE, indexOfPrevious.index);
        if (lowNullifier === undefined) {
          return undefined;
        }

        const lowNullifierPreimage = new NullifierLeafPreimage(
          new Fr(lowNullifier.value),
          new Fr(lowNullifier.nextValue),
          Number(lowNullifier.nextIndex),
        );
        const siblingPath = await this.db.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(indexOfPrevious.index));

        // Update the running paths
        const witness: LowNullifierWitnessData = {
          preimage: lowNullifierPreimage,
          index: BigInt(indexOfPrevious.index),
          siblingPath: siblingPath,
        };
        lowNullifierWitnesses.push(witness);

        // The low nullifier the inserted value will have
        const currentLeafLowNullifier = new NullifierLeafPreimage(
          new Fr(newValue),
          new Fr(lowNullifier.nextValue),
          Number(lowNullifier.nextIndex),
        );
        pendingInsertionSubtree.push(currentLeafLowNullifier);

        // Update the old low nullifier
        lowNullifier.nextValue = newValue;
        lowNullifier.nextIndex = startInsertionIndex + BigInt(i);

        await this.db.updateLeaf(MerkleTreeId.NULLIFIER_TREE, lowNullifier, BigInt(indexOfPrevious.index));
      }
    }

    // Perform batch insertion of new pending values
    for (let i = 0; i < pendingInsertionSubtree.length; i++) {
      const asLeafData: LeafData = {
        value: pendingInsertionSubtree[i].leafValue.value,
        nextValue: pendingInsertionSubtree[i].nextValue.value,
        nextIndex: BigInt(pendingInsertionSubtree[i].nextIndex),
      };

      await this.db.updateLeaf(MerkleTreeId.NULLIFIER_TREE, asLeafData, startInsertionIndex + BigInt(i));
    }

    return lowNullifierWitnesses;
  }

  // Builds the base rollup inputs, updating the contract, nullifier, and data trees in the process
  protected async buildBaseRollupInput(tx1: Tx, tx2: Tx) {
    // Get trees info before any changes hit
    const constants = await this.getConstantBaseRollupData();
    const startNullifierTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const startContractTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
    const startPrivateDataTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE);

    // Update the contract and data trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit, skipping the empty ones
    const wasm = await CircuitsWasm.get();
    const newContracts = flatMap([tx1, tx2], tx => tx.data.end.newContracts.map(cd => computeContractLeaf(wasm, cd)));
    const newCommitments = flatMap([tx1, tx2], tx => tx.data.end.newCommitments.map(x => x.toBuffer()));
    await this.db.appendLeaves(
      MerkleTreeId.CONTRACT_TREE,
      newContracts.map(x => x.toBuffer()),
    );

    await this.db.appendLeaves(MerkleTreeId.DATA_TREE, newCommitments);

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const newNullifiers = [...tx1.data.end.newNullifiers, ...tx2.data.end.newNullifiers];

    const nullifierWitnesses = await this.performBaseRollupBatchInsertionProofs(newNullifiers.map(fr => fr.toBuffer()));
    if (nullifierWitnesses === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }
    // Extract witness objects from returned data
    const lowNullifierMembershipWitnesses = nullifierWitnesses.map(w =>
      MembershipWitness.fromBufferArray(Number(w.index), w.siblingPath.data),
    );

    // Get the subtree sibling paths for the circuit
    const newCommitmentsSubtreeSiblingPath = await this.getSubtreeSiblingPath(
      MerkleTreeId.DATA_TREE,
      BaseRollupInputs.PRIVATE_DATA_SUBTREE_HEIGHT,
    );
    const newContractsSubtreeSiblingPath = await this.getSubtreeSiblingPath(
      MerkleTreeId.CONTRACT_TREE,
      BaseRollupInputs.CONTRACT_SUBTREE_HEIGHT,
    );
    const newNullifiersSubtreeSiblingPath = await this.getSubtreeSiblingPath(
      MerkleTreeId.NULLIFIER_TREE,
      BaseRollupInputs.NULLIFIER_SUBTREE_HEIGHT,
    );

    return BaseRollupInputs.from({
      constants,
      startNullifierTreeSnapshot,
      startContractTreeSnapshot,
      startPrivateDataTreeSnapshot,
      newCommitmentsSubtreeSiblingPath,
      newContractsSubtreeSiblingPath,
      newNullifiersSubtreeSiblingPath,
      lowNullifierLeafPreimages: nullifierWitnesses.map((w: LowNullifierWitnessData) => w.preimage),
      lowNullifierMembershipWitness: lowNullifierMembershipWitnesses,
      kernelData: [this.getKernelDataFor(tx1), this.getKernelDataFor(tx2)],
      historicContractsTreeRootMembershipWitnesses: [
        await this.getContractMembershipWitnessFor(tx1),
        await this.getContractMembershipWitnessFor(tx2),
      ],
      historicPrivateDataTreeRootMembershipWitnesses: [
        await this.getDataMembershipWitnessFor(tx1),
        await this.getDataMembershipWitnessFor(tx2),
      ],
    } as BaseRollupInputs);
  }

  protected makeEmptyMembershipWitness<N extends number>(height: N) {
    return new MembershipWitness(
      height,
      0,
      times(height, () => new Fr(0n)),
    );
  }
}
