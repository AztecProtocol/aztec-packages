import { ContractData, L2Block } from '@aztec/archiver';
import {
  AppendOnlyTreeSnapshot,
  BaseRollupInputs,
  BaseRollupPublicInputs,
  ConstantBaseRollupData,
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  Fr,
  MembershipWitness,
  NullifierLeafPreimage,
  NULLIFIER_TREE_HEIGHT,
  PreviousKernelData,
  PreviousRollupData,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
  RootRollupInputs,
  RootRollupPublicInputs,
  UInt8Vector,
  VK_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { toBigIntBE } from '@aztec/foundation';
import { Tx } from '@aztec/tx';
import { MerkleTreeDb, MerkleTreeId } from '@aztec/world-state';
import flatMap from 'lodash.flatmap';
import times from 'lodash.times';
import { makeEmptyTx } from '../deps/tx.js';
import { Proof, Prover } from '../prover/index.js';
import { Simulator } from '../simulator/index.js';
import { VerificationKeys } from './vks.js';

const frToBigInt = (fr: Fr) => toBigIntBE(fr.toBuffer());
const bigintToFr = (num: bigint) => new Fr(num);
const bigintToNum = (num: bigint) => Number(num);

// Denotes fields that are not used now, but will be in the future
const FUTURE_FR = new Fr(0n);
const FUTURE_NUM = 0;

// Denotes fields that should be deleted
const DELETE_FR = new Fr(0n);
const DELETE_ANY: any = {};
const TODO_ANY: any = {};

export class CircuitPoweredBlockBuilder {
  constructor(
    protected db: MerkleTreeDb,
    protected nextRollupId: number,
    protected vks: VerificationKeys,
    protected simulator: Simulator,
    protected prover: Prover,
  ) {}

  public async buildL2Block(tx: Tx): Promise<[L2Block, UInt8Vector]> {
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
    const txs = [tx, makeEmptyTx(), makeEmptyTx(), makeEmptyTx()];
    const [circuitsOutput, proof] = await this.runCircuits(txs);

    const {
      endPrivateDataTreeSnapshot,
      endNullifierTreeSnapshot,
      endContractTreeSnapshot,
      endTreeOfHistoricPrivateDataTreeRootsSnapshot,
      endTreeOfHistoricContractTreeRootsSnapshot,
    } = circuitsOutput;

    // Collect all new nullifiers, commitments, and contracts from all txs in this block
    const newNullifiers = flatMap(txs, tx => tx.data.end.newNullifiers);
    const newCommitments = flatMap(txs, tx => tx.data.end.newCommitments);
    const newContracts = flatMap(txs, tx => tx.data.end.newContracts).map(c => c.functionTreeRoot);
    const newContractData = flatMap(txs, tx => tx.data.end.newContracts).map(
      n => new ContractData(n.contractAddress, n.portalContractAddress),
    );

    const l2block = L2Block.fromFields({
      number: this.nextRollupId,
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

    return [l2block, proof];
  }

  protected async getTreeSnapshot(id: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(id);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }

  protected async runCircuits(txs: Tx[]): Promise<[RootRollupPublicInputs, Proof]> {
    const [tx1, tx2, tx3, tx4] = txs;

    const [baseRollupInputLeft, baseRollupOutputLeft] = await this.baseRollupCircuit(tx1, tx2);
    const [baseRollupInputRight, baseRollupOutputRight] = await this.baseRollupCircuit(tx3, tx4);

    const [baseRollupProofLeft, baseRollupProofRight] = await Promise.all([
      this.prover.getBaseRollupProof(baseRollupInputLeft, baseRollupOutputLeft),
      this.prover.getBaseRollupProof(baseRollupInputRight, baseRollupOutputRight),
    ]);

    const rootInput = await this.getRootRollupInput(
      baseRollupOutputLeft,
      baseRollupProofLeft,
      baseRollupOutputRight,
      baseRollupProofRight,
    );

    const rootOutput = await this.simulator.rootRollupCircuit(rootInput);
    const rootProof = await this.prover.getRootRollupProof(rootInput, rootOutput);
    await this.validateRootOutput(rootOutput);

    return [rootOutput, rootProof];
  }

  protected async baseRollupCircuit(tx1: Tx, tx2: Tx) {
    const rollupInput = await this.buildBaseRollupInput(tx1, tx2);
    const rollupOutput = await this.simulator.baseRollupCircuit(rollupInput);
    await this.validateTrees(rollupOutput);
    await this.updateRootTrees();
    return [rollupInput, rollupOutput] as const;
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
  protected async validateTrees(rollupOutput: BaseRollupPublicInputs | RootRollupPublicInputs) {
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

  protected async validateRootTree(
    rootOutput: RootRollupPublicInputs,
    treeId: MerkleTreeId,
    name: 'Contract' | 'PrivateData',
  ) {
    const localTree = await this.getTreeSnapshot(treeId);
    const simulatedTree = rootOutput[`endTreeOfHistoric${name}TreeRootsSnapshot`];
    this.validateSimulatedTree(localTree, simulatedTree, name);
  }

  protected async validateTree(
    output: BaseRollupPublicInputs | RootRollupPublicInputs,
    treeId: MerkleTreeId,
    name: 'PrivateData' | 'Contract' | 'Nullifier',
  ) {
    const localTree = await this.getTreeSnapshot(treeId);
    const simulatedTree = output[`end${name}TreeSnapshot`];
    this.validateSimulatedTree(localTree, simulatedTree, name);
  }

  protected validateSimulatedTree(
    localTree: AppendOnlyTreeSnapshot,
    simulatedTree: AppendOnlyTreeSnapshot,
    name: string,
  ) {
    if (!simulatedTree.root.toBuffer().equals(localTree.root.toBuffer())) {
      throw new Error(`${name} tree root mismatch (local ${localTree.root}, simulated ${simulatedTree.root})`);
    }
    if (simulatedTree.nextAvailableLeafIndex !== localTree.nextAvailableLeafIndex) {
      throw new Error(
        `${name} tree next available leaf index mismatch (local ${localTree.nextAvailableLeafIndex}, simulated ${simulatedTree.nextAvailableLeafIndex})`,
      );
    }
  }

  protected async getRootRollupInput(
    rollupOutputLeft: BaseRollupPublicInputs,
    rollupProofLeft: Proof,
    rollupOutputRight: BaseRollupPublicInputs,
    rollupProofRight: Proof,
  ) {
    const previousRollupData: RootRollupInputs['previousRollupData'] = [
      this.getPreviousRollupDataFromBaseRollup(rollupOutputLeft, rollupProofLeft),
      this.getPreviousRollupDataFromBaseRollup(rollupOutputRight, rollupProofRight),
    ];

    return new RootRollupInputs(
      previousRollupData,
      await this.getTreeSnapshot(MerkleTreeId.DATA_TREE),
      await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE),
      TODO_ANY,
      TODO_ANY,
      TODO_ANY,
    );
  }

  protected getPreviousRollupDataFromBaseRollup(rollupOutput: BaseRollupPublicInputs, rollupProof: Proof) {
    return new PreviousRollupData(
      rollupOutput,
      rollupProof,
      this.vks.baseRollupCircuit,

      // MembershipWitness for a VK tree to be implemented in the future
      FUTURE_NUM,
      Array(VK_TREE_HEIGHT).fill(FUTURE_FR),
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
      await this.inspectTree(treeId);
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

  protected async getConstantBaseRollupData(): Promise<ConstantBaseRollupData> {
    return ConstantBaseRollupData.from({
      baseRollupVkHash: DELETE_FR,
      mergeRollupVkHash: DELETE_FR,
      privateKernelVkTreeRoot: FUTURE_FR,
      publicKernelVkTreeRoot: FUTURE_FR,
      startTreeOfHistoricContractTreeRootsSnapshot: await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE),
      startTreeOfHistoricPrivateDataTreeRootsSnapshot: await this.getTreeSnapshot(MerkleTreeId.DATA_TREE_ROOTS_TREE),
      treeOfHistoricL1ToL2MsgTreeRootsSnapshot: DELETE_ANY,
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
    const prevValueInfo = this.db.getLeafData(tree, prevValueIndex.index);
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

  protected async buildBaseRollupInput(tx1: Tx, tx2: Tx) {
    // Get trees info before any changes hit
    const constants = await this.getConstantBaseRollupData();
    const startNullifierTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const startContractTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
    const startPrivateDateTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE);

    // Update the contract and data trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit
    const newContracts = [...tx1.data.end.newContracts, ...tx2.data.end.newContracts];
    const newCommitments = [...tx1.data.end.newCommitments, ...tx2.data.end.newCommitments];
    await this.db.appendLeaves(
      MerkleTreeId.CONTRACT_TREE,
      newContracts.map(fr => fr.toBuffer()),
    );
    await this.db.appendLeaves(
      MerkleTreeId.DATA_TREE,
      newCommitments.map(fr => fr.toBuffer()),
    );

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const newNullifiers = [...tx1.data.end.newNullifiers, ...tx2.data.end.newNullifiers];
    const lowNullifierInfos = [];
    for (const nullifier of newNullifiers) {
      lowNullifierInfos.push(await this.getLowNullifierInfo(nullifier));
      await this.db.appendLeaves(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
    }

    // Calculates membership witness for a contract tree root in the contract tree roots tree
    const getContractMembershipWitnessFor = (tx: Tx) =>
      this.getMembershipWitnessFor(
        tx.data.constants.oldTreeRoots.contractTreeRoot,
        MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
        CONTRACT_TREE_ROOTS_TREE_HEIGHT,
      );

    // Same but for data tree
    const getDataMembershipWitnessFor = (tx: Tx) =>
      this.getMembershipWitnessFor(
        tx.data.constants.oldTreeRoots.privateDataTreeRoot,
        MerkleTreeId.DATA_TREE_ROOTS_TREE,
        PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
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
      startPrivateDateTreeSnapshot,
      newCommitmentsSubtreeSiblingPath,
      newContractsSubtreeSiblingPath,
      newNullifiersSubtreeSiblingPath,
      lowNullifierLeafPreimages: lowNullifierInfos.map(i => i.leafPreimage),
      lowNullifierMembershipWitness: lowNullifierInfos.map(i => i.witness),
      kernelData: [this.getKernelDataFor(tx1), this.getKernelDataFor(tx2)],
      historicContractsTreeRootMembershipWitnesses: [
        await getContractMembershipWitnessFor(tx1),
        await getContractMembershipWitnessFor(tx2),
      ],
      historicPrivateDataTreeRootMembershipWitnesses: [
        await getDataMembershipWitnessFor(tx1),
        await getDataMembershipWitnessFor(tx2),
      ],
    } as BaseRollupInputs);
  }

  // For debugging purposes (maybe move it to merkle tree db?)
  protected async inspectTree(treeId: MerkleTreeId) {
    for (let i = 0; i < (await this.db.getTreeInfo(treeId).then(t => t.size)); i++) {
      console.log(
        `Tree ${treeId} leaf ${i}: ${await this.db
          .getLeafValue(treeId, BigInt(i))
          .then(x => x?.toString('hex') ?? '[undefined]')}`,
      );
    }
  }

  protected makeEmptyMembershipWitness<N extends number>(height: N) {
    return new MembershipWitness(
      height,
      0,
      times(height, () => new Fr(0n)),
    );
  }
}
