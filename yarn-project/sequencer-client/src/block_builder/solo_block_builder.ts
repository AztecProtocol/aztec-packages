import {
  ARCHIVE_HEIGHT,
  AppendOnlyTreeSnapshot,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  CONTRACT_SUBTREE_HEIGHT,
  CONTRACT_SUBTREE_SIBLING_PATH_LENGTH,
  ConstantRollupData,
  GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP,
  MAX_PUBLIC_DATA_READS_PER_BASE_ROLLUP,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_BASE_ROLLUP,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MembershipWitness,
  MergeRollupInputs,
  NOTE_HASH_SUBTREE_HEIGHT,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NullifierLeafPreimage,
  PUBLIC_DATA_TREE_HEIGHT,
  PreviousKernelData,
  PreviousRollupData,
  Proof,
  ROLLUP_VK_TREE_HEIGHT,
  RollupTypes,
  RootRollupInputs,
  RootRollupPublicInputs,
  VK_TREE_HEIGHT,
  VerificationKey,
  makeTuple,
} from '@aztec/circuits.js';
import {
  computeBlockHash,
  computeBlockHashWithGlobals,
  computeContractLeaf,
  computeGlobalsHash,
} from '@aztec/circuits.js/abis';
import { toFriendlyJSON } from '@aztec/circuits.js/utils';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { Tuple, assertLength } from '@aztec/foundation/serialize';
import { ContractData, L2Block, L2BlockL2Logs, MerkleTreeId, PublicDataWrite, TxL2Logs } from '@aztec/types';
import { MerkleTreeOperations } from '@aztec/world-state';

import chunk from 'lodash.chunk';
import flatMap from 'lodash.flatmap';

import { VerificationKeys } from '../mocks/verification_keys.js';
import { RollupProver } from '../prover/index.js';
import { ProcessedTx } from '../sequencer/processed_tx.js';
import { RollupSimulator } from '../simulator/index.js';
import { BlockBuilder } from './index.js';
import { AllowedTreeNames, OutputWithTreeSnapshot, TreeNames } from './types.js';

const frToBigInt = (fr: Fr) => toBigIntBE(fr.toBuffer());

// Denotes fields that are not used now, but will be in the future
const FUTURE_FR = new Fr(0n);
const FUTURE_NUM = 0;

// Denotes fields that should be deleted
const DELETE_FR = new Fr(0n);

/**
 * Builds an L2 block out of a set of ProcessedTx's,
 * using the base, merge, and root rollup circuits.
 */
export class SoloBlockBuilder implements BlockBuilder {
  constructor(
    protected db: MerkleTreeOperations,
    protected vks: VerificationKeys,
    protected simulator: RollupSimulator,
    protected prover: RollupProver,
    protected debug = createDebugLogger('aztec:sequencer:solo-block-builder'),
  ) {}

  /**
   * Builds an L2 block with the given number containing the given txs, updating state trees.
   * @param globalVariables - Global variables to be used in the block.
   * @param txs - Processed transactions to include in the block.
   * @param newL1ToL2Messages - L1 to L2 messages to be part of the block.
   * @param timestamp - Timestamp of the block.
   * @returns The new L2 block and a correctness proof as returned by the root rollup circuit.
   */
  public async buildL2Block(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newL1ToL2Messages: Fr[],
  ): Promise<[L2Block, Proof]> {
    const [
      startNoteHashTreeSnapshot,
      startNullifierTreeSnapshot,
      startContractTreeSnapshot,
      startPublicDataTreeSnapshot,
      startL1ToL2MessageTreeSnapshot,
      startArchiveSnapshot,
    ] = await Promise.all(
      [
        MerkleTreeId.NOTE_HASH_TREE,
        MerkleTreeId.NULLIFIER_TREE,
        MerkleTreeId.CONTRACT_TREE,
        MerkleTreeId.PUBLIC_DATA_TREE,
        MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
        MerkleTreeId.ARCHIVE,
      ].map(tree => this.getTreeSnapshot(tree)),
    );

    // Check txs are good for processing
    this.validateTxs(txs);

    // We fill the tx batch with empty txs, we process only one tx at a time for now
    const [circuitsOutput, proof] = await this.runCircuits(globalVariables, txs, newL1ToL2Messages);

    const {
      endNoteHashTreeSnapshot,
      endNullifierTreeSnapshot,
      endContractTreeSnapshot,
      endPublicDataTreeRoot,
      endL1ToL2MessagesTreeSnapshot,
      endArchiveSnapshot,
    } = circuitsOutput;

    // Collect all new nullifiers, commitments, and contracts from all txs in this block
    const newNullifiers = flatMap(txs, tx => tx.data.end.newNullifiers);
    const newCommitments = flatMap(txs, tx => tx.data.end.newCommitments);
    const newContracts = flatMap(txs, tx => tx.data.end.newContracts).map(cd => computeContractLeaf(cd));
    const newContractData = flatMap(txs, tx => tx.data.end.newContracts).map(
      n => new ContractData(n.contractAddress, n.portalContractAddress),
    );
    const newPublicDataWrites = flatMap(txs, tx =>
      tx.data.end.publicDataUpdateRequests.map(t => new PublicDataWrite(t.leafIndex, t.newValue)),
    );
    const newL2ToL1Msgs = flatMap(txs, tx => tx.data.end.newL2ToL1Msgs);

    // Consolidate logs data from all txs
    const encryptedLogsArr: TxL2Logs[] = [];
    const unencryptedLogsArr: TxL2Logs[] = [];
    for (const tx of txs) {
      const encryptedLogs = tx.encryptedLogs || new TxL2Logs([]);
      encryptedLogsArr.push(encryptedLogs);
      const unencryptedLogs = tx.unencryptedLogs || new TxL2Logs([]);
      unencryptedLogsArr.push(unencryptedLogs);
    }
    const newEncryptedLogs = new L2BlockL2Logs(encryptedLogsArr);
    const newUnencryptedLogs = new L2BlockL2Logs(unencryptedLogsArr);

    const l2Block = L2Block.fromFields({
      number: Number(globalVariables.blockNumber.value),
      globalVariables,
      startNoteHashTreeSnapshot,
      endNoteHashTreeSnapshot,
      startNullifierTreeSnapshot,
      endNullifierTreeSnapshot,
      startContractTreeSnapshot,
      endContractTreeSnapshot,
      startPublicDataTreeRoot: startPublicDataTreeSnapshot.root,
      endPublicDataTreeRoot,
      startL1ToL2MessagesTreeSnapshot: startL1ToL2MessageTreeSnapshot,
      endL1ToL2MessagesTreeSnapshot,
      startArchiveSnapshot,
      endArchiveSnapshot,
      newCommitments,
      newNullifiers,
      newL2ToL1Msgs,
      newContracts,
      newContractData,
      newPublicDataWrites,
      newL1ToL2Messages,
      newEncryptedLogs,
      newUnencryptedLogs,
    });

    if (!l2Block.getCalldataHash().equals(circuitsOutput.sha256CalldataHash())) {
      throw new Error(
        `Calldata hash mismatch, ${l2Block.getCalldataHash().toString('hex')} == ${circuitsOutput
          .sha256CalldataHash()
          .toString('hex')} `,
      );
    }

    return [l2Block, proof];
  }

  protected validateTxs(txs: ProcessedTx[]) {
    for (const tx of txs) {
      for (const historicalTreeRoot of [
        'noteHashTreeRoot',
        'contractTreeRoot',
        'nullifierTreeRoot',
        'l1ToL2MessagesTreeRoot',
      ] as const) {
        if (tx.data.constants.blockHeader[historicalTreeRoot].isZero()) {
          throw new Error(`Empty ${historicalTreeRoot} for tx: ${toFriendlyJSON(tx)}`);
        }
      }
    }
  }

  protected async getTreeSnapshot(id: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(id);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }

  protected async runCircuits(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newL1ToL2Messages: Fr[],
  ): Promise<[RootRollupPublicInputs, Proof]> {
    // Check that the length of the array of txs is a power of two
    // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
    if (txs.length < 4 || (txs.length & (txs.length - 1)) !== 0) {
      throw new Error(`Length of txs for the block should be a power of two and at least four (got ${txs.length})`);
    }

    // padArrayEnd throws if the array is already full. Otherwise it pads till we reach the required size
    const newL1ToL2MessagesTuple = padArrayEnd(newL1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    // Run the base rollup circuits for the txs
    const baseRollupOutputs: [BaseOrMergeRollupPublicInputs, Proof][] = [];
    for (const pair of chunk(txs, 2)) {
      const [tx1, tx2] = pair;
      baseRollupOutputs.push(await this.baseRollupCircuit(tx1, tx2, globalVariables));
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
    return this.rootRollupCircuit(mergeOutputLeft, mergeOutputRight, newL1ToL2MessagesTuple);
  }

  protected async baseRollupCircuit(
    tx1: ProcessedTx,
    tx2: ProcessedTx,
    globalVariables: GlobalVariables,
  ): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    this.debug(`Running base rollup for ${tx1.hash} ${tx2.hash}`);
    const rollupInput = await this.buildBaseRollupInput(tx1, tx2, globalVariables);
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
    newL1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
  ): Promise<[RootRollupPublicInputs, Proof]> {
    this.debug(`Running root rollup circuit`);
    const rootInput = await this.getRootRollupInput(...left, ...right, newL1ToL2Messages);

    // Update the local trees to include the new l1 to l2 messages
    await this.db.appendLeaves(
      MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
      newL1ToL2Messages.map(m => m.toBuffer()),
    );

    // Simulate and get proof for the root circuit
    const rootOutput = await this.simulator.rootRollupCircuit(rootInput);

    const rootProof = await this.prover.getRootRollupProof(rootInput, rootOutput);

    // Update the root trees with the latest data and contract tree roots,
    // and validate them against the output of the root circuit simulation
    this.debug(`Updating and validating root trees`);
    const globalVariablesHash = computeGlobalsHash(left[0].constants.globalVariables);
    await this.db.updateLatestGlobalVariablesHash(globalVariablesHash);
    await this.db.updateArchive(globalVariablesHash);

    await this.validateRootOutput(rootOutput);

    return [rootOutput, rootProof];
  }

  async updateArchive(globalVariables: GlobalVariables) {
    // Calculate the block hash and add it to the historical block hashes tree
    const blockHash = await this.calculateBlockHash(globalVariables);
    await this.db.appendLeaves(MerkleTreeId.ARCHIVE, [blockHash.toBuffer()]);
  }

  protected async calculateBlockHash(globals: GlobalVariables) {
    const [noteHashTreeRoot, nullifierTreeRoot, contractTreeRoot, publicDataTreeRoot, l1ToL2MessageTreeRoot] = (
      await Promise.all(
        [
          MerkleTreeId.NOTE_HASH_TREE,
          MerkleTreeId.NULLIFIER_TREE,
          MerkleTreeId.CONTRACT_TREE,
          MerkleTreeId.PUBLIC_DATA_TREE,
          MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
        ].map(tree => this.getTreeSnapshot(tree)),
      )
    ).map(r => r.root);

    const blockHash = computeBlockHashWithGlobals(
      globals,
      noteHashTreeRoot,
      nullifierTreeRoot,
      contractTreeRoot,
      l1ToL2MessageTreeRoot,
      publicDataTreeRoot,
    );
    return blockHash;
  }

  // Validate that the new roots we calculated from manual insertions match the outputs of the simulation
  protected async validateTrees(rollupOutput: BaseOrMergeRollupPublicInputs | RootRollupPublicInputs) {
    await Promise.all([
      this.validateTree(rollupOutput, MerkleTreeId.CONTRACT_TREE, 'ContractTree'),
      this.validateTree(rollupOutput, MerkleTreeId.NOTE_HASH_TREE, 'NoteHashTree'),
      this.validateTree(rollupOutput, MerkleTreeId.NULLIFIER_TREE, 'NullifierTree'),
      this.validatePublicDataTreeRoot(rollupOutput),
    ]);
  }

  // Validate that the roots of all local trees match the output of the root circuit simulation
  protected async validateRootOutput(rootOutput: RootRollupPublicInputs) {
    await Promise.all([
      this.validateTrees(rootOutput),
      this.validateTree(rootOutput, MerkleTreeId.ARCHIVE, 'Archive'),
      this.validateTree(rootOutput, MerkleTreeId.L1_TO_L2_MESSAGES_TREE, 'L1ToL2MessagesTree'),
    ]);
  }

  /**
   * Validates that the root of the public data tree matches the output of the circuit simulation.
   * @param output - The output of the circuit simulation.
   * Note: Public data tree is sparse, so the "next available leaf index" doesn't make sense there.
   *       For this reason we only validate root.
   */
  protected async validatePublicDataTreeRoot(output: BaseOrMergeRollupPublicInputs | RootRollupPublicInputs) {
    const localTree = await this.getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE);
    const simulatedTreeRoot = output[`endPublicDataTreeRoot`];

    if (!simulatedTreeRoot.toBuffer().equals(localTree.root.toBuffer())) {
      throw new Error(`PublicData tree root mismatch (local ${localTree.root}, simulated ${simulatedTreeRoot})`);
    }
  }

  // Helper for validating a non-roots tree against a circuit simulation output
  protected async validateTree<T extends BaseOrMergeRollupPublicInputs | RootRollupPublicInputs>(
    output: T,
    treeId: MerkleTreeId,
    name: AllowedTreeNames<T>,
  ) {
    if ('endL1ToL2MessageTreeSnapshot' in output && !(output instanceof RootRollupPublicInputs)) {
      throw new Error(`The name 'L1ToL2Message' can only be used when output is of type RootRollupPublicInputs`);
    }

    const localTree = await this.getTreeSnapshot(treeId);
    const simulatedTree = (output as OutputWithTreeSnapshot<T>)[`end${name}Snapshot`];
    this.validateSimulatedTree(localTree, simulatedTree, name);
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

  // Builds the inputs for the root rollup circuit, without making any changes to trees
  protected async getRootRollupInput(
    rollupOutputLeft: BaseOrMergeRollupPublicInputs,
    rollupProofLeft: Proof,
    rollupOutputRight: BaseOrMergeRollupPublicInputs,
    rollupProofRight: Proof,
    newL1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
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
      return path.toFieldArray();
    };

    const newL1ToL2MessagesTreeRootSiblingPathArray = await this.getSubtreeSiblingPath(
      MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
    );

    const newL1ToL2MessagesTreeRootSiblingPath = makeTuple(
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
      i =>
        i < newL1ToL2MessagesTreeRootSiblingPathArray.length ? newL1ToL2MessagesTreeRootSiblingPathArray[i] : Fr.ZERO,
      0,
    );

    // Get tree snapshots
    const startL1ToL2MessagesTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGES_TREE);

    // Get blocks tree
    const startArchiveSnapshot = await this.getTreeSnapshot(MerkleTreeId.ARCHIVE);
    const newArchiveSiblingPathArray = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE);

    const newArchiveSiblingPath = makeTuple(
      ARCHIVE_HEIGHT,
      i => (i < newArchiveSiblingPathArray.length ? newArchiveSiblingPathArray[i] : Fr.ZERO),
      0,
    );

    return RootRollupInputs.from({
      previousRollupData,
      newL1ToL2Messages,
      newL1ToL2MessagesTreeRootSiblingPath,
      startL1ToL2MessagesTreeSnapshot,
      startArchiveSnapshot,
      newArchiveSiblingPath,
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
      new MembershipWitness(
        ROLLUP_VK_TREE_HEIGHT,
        BigInt(FUTURE_NUM),
        makeTuple(ROLLUP_VK_TREE_HEIGHT, () => FUTURE_FR),
      ),
    );
  }

  protected getKernelDataFor(tx: ProcessedTx) {
    return new PreviousKernelData(
      tx.data,
      tx.proof,

      // VK for the kernel circuit
      this.vks.privateKernelCircuit,

      // MembershipWitness for a VK tree to be implemented in the future
      FUTURE_NUM,
      assertLength(Array(VK_TREE_HEIGHT).fill(FUTURE_FR), VK_TREE_HEIGHT),
    );
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
    return new MembershipWitness(height, index, assertLength(path.toFieldArray(), height));
  }

  protected getHistoricalTreesMembershipWitnessFor(tx: ProcessedTx) {
    const blockHeader = tx.data.constants.blockHeader;
    const { noteHashTreeRoot, nullifierTreeRoot, contractTreeRoot, l1ToL2MessagesTreeRoot, publicDataTreeRoot } =
      blockHeader;
    const blockHash = computeBlockHash(
      blockHeader.globalVariablesHash,
      noteHashTreeRoot,
      nullifierTreeRoot,
      contractTreeRoot,
      l1ToL2MessagesTreeRoot,
      publicDataTreeRoot,
    );
    return this.getMembershipWitnessFor(blockHash, MerkleTreeId.ARCHIVE, ARCHIVE_HEIGHT);
  }

  protected async getConstantRollupData(globalVariables: GlobalVariables): Promise<ConstantRollupData> {
    return ConstantRollupData.from({
      baseRollupVkHash: DELETE_FR,
      mergeRollupVkHash: DELETE_FR,
      privateKernelVkTreeRoot: FUTURE_FR,
      publicKernelVkTreeRoot: FUTURE_FR,
      archiveSnapshot: await this.getTreeSnapshot(MerkleTreeId.ARCHIVE),
      globalVariables,
    });
  }

  protected async getLowNullifierInfo(nullifier: Fr) {
    // Return empty nullifier info for an empty tx
    if (nullifier.value === 0n) {
      return {
        index: 0,
        leafPreimage: NullifierLeafPreimage.empty(),
        witness: this.makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
      };
    }

    const tree = MerkleTreeId.NULLIFIER_TREE;
    const prevValueIndex = await this.db.getPreviousValueIndex(tree, frToBigInt(nullifier));
    if (!prevValueIndex) {
      throw new Error(`Nullifier tree should have one initial leaf`);
    }
    const prevValuePreimage = (await this.db.getLeafPreimage(tree, prevValueIndex.index))!;

    const prevValueSiblingPath = await this.db.getSiblingPath(tree, BigInt(prevValueIndex.index));

    return {
      index: prevValueIndex,
      leafPreimage: prevValuePreimage,
      witness: new MembershipWitness(
        NULLIFIER_TREE_HEIGHT,
        BigInt(prevValueIndex.index),
        assertLength(prevValueSiblingPath.toFieldArray(), NULLIFIER_TREE_HEIGHT),
      ),
    };
  }

  protected async getSubtreeSiblingPath(treeId: MerkleTreeId, subtreeHeight: number): Promise<Fr[]> {
    const nextAvailableLeafIndex = await this.db.getTreeInfo(treeId).then(t => t.size);
    const fullSiblingPath = await this.db.getSiblingPath(treeId, nextAvailableLeafIndex);

    // Drop the first subtreeHeight items since we only care about the path to the subtree root
    return fullSiblingPath.getSubtreeSiblingPath(subtreeHeight).toFieldArray();
  }

  protected async processPublicDataUpdateRequests(tx: ProcessedTx) {
    const newPublicDataUpdateRequestsSiblingPaths: Tuple<
      Tuple<Fr, typeof PUBLIC_DATA_TREE_HEIGHT>,
      typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    > = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => makeTuple(PUBLIC_DATA_TREE_HEIGHT, Fr.zero));
    for (const i in tx.data.end.publicDataUpdateRequests) {
      const index = tx.data.end.publicDataUpdateRequests[i].leafIndex.value;
      await this.db.updateLeaf(
        MerkleTreeId.PUBLIC_DATA_TREE,
        tx.data.end.publicDataUpdateRequests[i].newValue.toBuffer(),
        index,
      );
      const path = await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, index);
      const array = path.toFieldArray();
      newPublicDataUpdateRequestsSiblingPaths[i] = makeTuple(PUBLIC_DATA_TREE_HEIGHT, j =>
        j < array.length ? array[j] : Fr.ZERO,
      );
    }
    return newPublicDataUpdateRequestsSiblingPaths;
  }

  protected async getPublicDataReadsSiblingPaths(tx: ProcessedTx) {
    const newPublicDataReadsSiblingPaths: Tuple<
      Tuple<Fr, typeof PUBLIC_DATA_TREE_HEIGHT>,
      typeof MAX_PUBLIC_DATA_READS_PER_TX
    > = makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, () => makeTuple(PUBLIC_DATA_TREE_HEIGHT, Fr.zero));
    for (const i in tx.data.end.publicDataReads) {
      const index = tx.data.end.publicDataReads[i].leafIndex.value;
      const path = await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, index);
      const array = path.toFieldArray();
      newPublicDataReadsSiblingPaths[i] = makeTuple(PUBLIC_DATA_TREE_HEIGHT, j =>
        j < array.length ? array[j] : Fr.ZERO,
      );
    }
    return newPublicDataReadsSiblingPaths;
  }

  // Builds the base rollup inputs, updating the contract, nullifier, and data trees in the process
  protected async buildBaseRollupInput(left: ProcessedTx, right: ProcessedTx, globalVariables: GlobalVariables) {
    // Get trees info before any changes hit
    const constants = await this.getConstantRollupData(globalVariables);
    const startNullifierTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const startContractTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
    const startNoteHashTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE);
    const startPublicDataTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE);
    const startArchiveSnapshot = await this.getTreeSnapshot(MerkleTreeId.ARCHIVE);

    // Get the subtree sibling paths for the circuit
    const newCommitmentsSubtreeSiblingPathArray = await this.getSubtreeSiblingPath(
      MerkleTreeId.NOTE_HASH_TREE,
      NOTE_HASH_SUBTREE_HEIGHT,
    );

    const newCommitmentsSubtreeSiblingPath = makeTuple(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < newCommitmentsSubtreeSiblingPathArray.length ? newCommitmentsSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    const newContractsSubtreeSiblingPathArray = await this.getSubtreeSiblingPath(
      MerkleTreeId.CONTRACT_TREE,
      CONTRACT_SUBTREE_HEIGHT,
    );

    const newContractsSubtreeSiblingPath = makeTuple(CONTRACT_SUBTREE_SIBLING_PATH_LENGTH, i =>
      i < newContractsSubtreeSiblingPathArray.length ? newContractsSubtreeSiblingPathArray[i] : Fr.ZERO,
    );

    // Update the contract and note hash trees with the new items being inserted to get the new roots
    // that will be used by the next iteration of the base rollup circuit, skipping the empty ones
    const newContracts = flatMap([left, right], tx => tx.data.end.newContracts.map(cd => computeContractLeaf(cd)));
    const newCommitments = flatMap([left, right], tx => tx.data.end.newCommitments.map(x => x.toBuffer()));
    await this.db.appendLeaves(
      MerkleTreeId.CONTRACT_TREE,
      newContracts.map(x => x.toBuffer()),
    );

    await this.db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, newCommitments);

    // Update the public data tree and get membership witnesses.
    // All public data reads are checked against the unmodified data root when the corresponding tx started,
    // so it's the unmodified tree for tx1, and the one after applying tx1 update request for tx2.
    // Update requests are checked against the tree as it is iteratively updated.
    // See https://github.com/AztecProtocol/aztec3-packages/issues/270#issuecomment-1522258200
    const leftPublicDataReadSiblingPaths = await this.getPublicDataReadsSiblingPaths(left);
    const leftPublicDataUpdateRequestsSiblingPaths = await this.processPublicDataUpdateRequests(left);
    const rightPublicDataReadSiblingPaths = await this.getPublicDataReadsSiblingPaths(right);
    const rightPublicDataUpdateRequestsSiblingPaths = await this.processPublicDataUpdateRequests(right);

    const newPublicDataReadsSiblingPaths = makeTuple(MAX_PUBLIC_DATA_READS_PER_BASE_ROLLUP, i =>
      i < MAX_PUBLIC_DATA_READS_PER_TX
        ? leftPublicDataReadSiblingPaths[i]
        : rightPublicDataReadSiblingPaths[i - MAX_PUBLIC_DATA_READS_PER_TX],
    );

    const newPublicDataUpdateRequestsSiblingPaths = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_BASE_ROLLUP, i =>
      i < MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
        ? leftPublicDataUpdateRequestsSiblingPaths[i]
        : rightPublicDataUpdateRequestsSiblingPaths[i - MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    );

    // Update the nullifier tree, capturing the low nullifier info for each individual operation
    const newNullifiers = [...left.data.end.newNullifiers, ...right.data.end.newNullifiers];

    const {
      lowLeavesWitnessData: nullifierWitnessLeaves,
      newSubtreeSiblingPath: newNullifiersSubtreeSiblingPath,
      sortedNewLeaves: sortedNewNullifiers,
      sortedNewLeavesIndexes: sortednewNullifiersIndexes,
    } = await this.db.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      newNullifiers.map(fr => fr.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    if (nullifierWitnessLeaves === undefined) {
      throw new Error(`Could not craft nullifier batch insertion proofs`);
    }

    // Extract witness objects from returned data
    const lowNullifierMembershipWitnesses: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>[] =
      nullifierWitnessLeaves.map(l =>
        MembershipWitness.fromBufferArray(l.index, assertLength(l.siblingPath.toBufferArray(), NULLIFIER_TREE_HEIGHT)),
      );

    const newNullifiersSubtreeSiblingPathArray = newNullifiersSubtreeSiblingPath.toFieldArray();

    return BaseRollupInputs.from({
      constants,
      startNullifierTreeSnapshot,
      startContractTreeSnapshot,
      startNoteHashTreeSnapshot,
      startPublicDataTreeRoot: startPublicDataTreeSnapshot.root,
      archiveSnapshot: startArchiveSnapshot,
      sortedNewNullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP, i => Fr.fromBuffer(sortedNewNullifiers[i])),
      sortednewNullifiersIndexes: makeTuple(MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP, i => sortednewNullifiersIndexes[i]),
      newCommitmentsSubtreeSiblingPath,
      newContractsSubtreeSiblingPath,
      newNullifiersSubtreeSiblingPath: makeTuple(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, i =>
        i < newNullifiersSubtreeSiblingPathArray.length ? newNullifiersSubtreeSiblingPathArray[i] : Fr.ZERO,
      ),
      newPublicDataUpdateRequestsSiblingPaths,
      newPublicDataReadsSiblingPaths,
      lowNullifierLeafPreimages: makeTuple(MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP, i =>
        i < nullifierWitnessLeaves.length
          ? (nullifierWitnessLeaves[i].leafPreimage as NullifierLeafPreimage)
          : NullifierLeafPreimage.empty(),
      ),
      lowNullifierMembershipWitness: makeTuple(MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP, i =>
        i < lowNullifierMembershipWitnesses.length
          ? lowNullifierMembershipWitnesses[i]
          : this.makeEmptyMembershipWitness(NULLIFIER_TREE_HEIGHT),
      ),
      kernelData: [this.getKernelDataFor(left), this.getKernelDataFor(right)],
      archiveRootMembershipWitnesses: [
        await this.getHistoricalTreesMembershipWitnessFor(left),
        await this.getHistoricalTreesMembershipWitnessFor(right),
      ],
    });
  }

  protected makeEmptyMembershipWitness<N extends number>(height: N) {
    return new MembershipWitness(
      height,
      0n,
      makeTuple(height, () => Fr.ZERO),
    );
  }
}
