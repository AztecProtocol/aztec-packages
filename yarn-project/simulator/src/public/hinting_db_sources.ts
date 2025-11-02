import { sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { IndexedTreeLeafPreimage, SiblingPath } from '@aztec/foundation/trees';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import {
  AvmAppendLeavesHint,
  AvmBytecodeCommitmentHint,
  AvmCommitCheckpointHint,
  AvmContractClassHint,
  AvmContractDBCommitCheckpointHint,
  AvmContractDBCreateCheckpointHint,
  AvmContractDBRevertCheckpointHint,
  AvmContractInstanceHint,
  AvmCreateCheckpointHint,
  AvmDebugFunctionNameHint,
  type AvmExecutionHints,
  AvmGetLeafPreimageHintNullifierTree,
  AvmGetLeafPreimageHintPublicDataTree,
  AvmGetLeafValueHint,
  AvmGetPreviousValueIndexHint,
  AvmGetSiblingPathHint,
  AvmRevertCheckpointHint,
  AvmSequentialInsertHintNullifierTree,
  AvmSequentialInsertHintPublicDataTree,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import {
  AppendOnlyTreeSnapshot,
  type BatchInsertionResult,
  type IndexedTreeId,
  MerkleTreeId,
  type MerkleTreeLeafType,
  type MerkleTreeWriteOperations,
  NullifierLeaf,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  type SequentialInsertionResult,
  type TreeHeights,
  getTreeName,
  merkleTreeIds,
} from '@aztec/stdlib/trees';
import { TreeSnapshots } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import type { WorldStateRevision } from '@aztec/stdlib/world-state';

import { strict as assert } from 'assert';

import type { PublicContractsDBInterface } from './db_interfaces.js';

/**
 * A public contracts database that forwards requests and collects AVM hints.
 */
export class HintingPublicContractsDB implements PublicContractsDBInterface {
  private static readonly log: Logger = createLogger('simulator:hinting-contracts-db');

  // We deduplicate contract classes because they include the whole bytecode.
  private contractClassIds: Set<bigint> = new Set();

  // Checkpoint ID management using monotonically increasing IDs (never reused)
  // This matches the pattern used by HintingMerkleWriteOperations
  private checkpointStack: number[] = [0];
  private nextCheckpointId: number = 1;
  private checkpointActionCounter: number = 0; // yes, a side-effect counter.

  constructor(
    private readonly db: PublicContractsDBInterface,
    private hints: AvmExecutionHints,
  ) {}

  /**
   * Gets the current checkpoint ID.
   * Checkpoint ID is managed at the hinting layer to ensure hints have correct IDs.
   */
  public getCheckpointId(): number {
    return this.checkpointStack[this.checkpointStack.length - 1];
  }

  /**
   * Adds contracts (classes and instances) to the database.
   * Forwards to the underlying DB and collects contract instance hints.
   */
  public async addContracts(
    contractClasses: ContractClassPublic[],
    contractInstances: ContractInstanceWithAddress[],
  ): Promise<void> {
    // Add to underlying DB first
    await this.db.addContracts(contractClasses, contractInstances);

    // Collect hints for each added contract instance so C++ knows about them
    const checkpointId = this.getCheckpointId();
    for (const instance of contractInstances) {
      this.hints.contractInstances.push(
        new AvmContractInstanceHint(
          checkpointId,
          instance.address,
          instance.salt,
          instance.deployer,
          instance.currentContractClassId,
          instance.originalContractClassId,
          instance.initializationHash,
          instance.publicKeys,
        ),
      );
    }
  }

  public async getContractInstance(
    address: AztecAddress,
    timestamp: UInt64,
  ): Promise<ContractInstanceWithAddress | undefined> {
    const checkpointId = this.getCheckpointId();
    HintingPublicContractsDB.log.info(
      `[TS] getContractInstance looking up: checkpointId=${checkpointId} address=${address.toString().slice(0, 20)}...`,
    );
    const instance = await this.db.getContractInstance(address, timestamp);
    if (instance) {
      HintingPublicContractsDB.log.info(
        `[TS] getContractInstance FOUND: checkpointId=${checkpointId} address=${address.toString().slice(0, 20)}...`,
      );
      HintingPublicContractsDB.log.info(
        `[TS] Adding contract instance hint with checkpointId=${checkpointId}, total hints so far=${this.hints.contractInstances.length}`,
      );
      // We don't need to hint the block number because it doesn't change.
      this.hints.contractInstances.push(
        new AvmContractInstanceHint(
          this.checkpointActionCounter, // Include checkpoint ID as hintKey
          instance.address,
          instance.salt,
          instance.deployer,
          instance.currentContractClassId,
          instance.originalContractClassId,
          instance.initializationHash,
          instance.publicKeys,
        ),
      );
    } else {
      HintingPublicContractsDB.log.info(
        `[TS] getContractInstance NOT FOUND: checkpointId=${checkpointId} address=${address.toString().slice(0, 20)}...`,
      );
    }
    return instance;
  }

  public async getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined> {
    const contractClass = await this.db.getContractClass(contractClassId);
    if (contractClass && !this.contractClassIds.has(contractClassId.toBigInt())) {
      this.contractClassIds.add(contractClassId.toBigInt());
      // Get current checkpoint ID from the underlying DB
      const checkpointId = this.getCheckpointId();

      this.hints.contractClasses.push(
        new AvmContractClassHint(
          this.checkpointActionCounter, // Include checkpoint ID as hintKey
          contractClass.id,
          contractClass.artifactHash,
          contractClass.privateFunctionsRoot,
          contractClass.packedBytecode,
        ),
      );
    }
    return contractClass;
  }

  public async getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined> {
    const commitment = await this.db.getBytecodeCommitment(contractClassId);
    if (commitment) {
      // Get current checkpoint ID from the underlying DB
      const checkpointId = this.getCheckpointId();

      this.hints.bytecodeCommitments.push(
        new AvmBytecodeCommitmentHint(
          this.checkpointActionCounter, // Include checkpoint ID as hintKey
          contractClassId,
          commitment,
        ),
      );
    }
    return commitment;
  }

  public async getDebugFunctionName(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<string | undefined> {
    const name = await this.db.getDebugFunctionName(contractAddress, selector);
    if (name) {
      // We hint selector as a field to make things way simpler in C++.
      this.hints.debugFunctionNames.push(new AvmDebugFunctionNameHint(contractAddress, selector.toField(), name));
    }
    return name;
  }

  // Checkpoint methods pass through to underlying DB and manage checkpoint ID
  // Uses monotonically increasing checkpoint IDs (never reused after revert)
  public createCheckpoint(): void {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCheckpointId();
    this.db.createCheckpoint();
    this.checkpointStack.push(this.nextCheckpointId++);
    const newCheckpointId = this.getCheckpointId();

    this.hints.contractDBCreateCheckpointHints.push(
      new AvmContractDBCreateCheckpointHint(actionCounter, oldCheckpointId, newCheckpointId),
    );
  }

  public commitCheckpoint(): void {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCheckpointId();
    this.db.commitCheckpoint();
    this.checkpointStack.pop();
    const newCheckpointId = this.getCheckpointId();

    this.hints.contractDBCommitCheckpointHints.push(
      new AvmContractDBCommitCheckpointHint(actionCounter, oldCheckpointId, newCheckpointId),
    );
  }

  public revertCheckpoint(): void {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCheckpointId();
    this.db.revertCheckpoint();
    this.checkpointStack.pop();
    const newCheckpointId = this.getCheckpointId();

    this.hints.contractDBRevertCheckpointHints.push(
      new AvmContractDBRevertCheckpointHint(actionCounter, oldCheckpointId, newCheckpointId),
    );
  }
}

/**
 * A low-level merkle DB that collects hints.
 */
export class HintingMerkleWriteOperations implements MerkleTreeWriteOperations {
  private static readonly log: Logger = createLogger('simulator:hinting-merkle-db');
  // This stack is only for debugging purposes.
  // The top of the stack is the current checkpoint id.
  // We need the stack to be non-empty and use 0 as an arbitrary initial checkpoint id.
  // This is not necessarily a checkpoint that happened, but whatever tree state we start with.
  private checkpointStack: number[] = [0];
  private nextCheckpointId: number = 1;
  private checkpointActionCounter: number = 0; // yes, a side-effect counter.

  public static async create(db: MerkleTreeWriteOperations, hints: AvmExecutionHints) {
    const hintingTreesDB = new HintingMerkleWriteOperations(db, hints);
    const startStateReference = await db.getStateReference();
    hints.startingTreeRoots = new TreeSnapshots(
      startStateReference.l1ToL2MessageTree,
      startStateReference.partial.noteHashTree,
      startStateReference.partial.nullifierTree,
      startStateReference.partial.publicDataTree,
    );

    return hintingTreesDB;
  }

  // Use create() to instantiate.
  private constructor(
    private db: MerkleTreeWriteOperations,
    private hints: AvmExecutionHints,
  ) {}

  // Getters.
  public async getSiblingPath<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<SiblingPath<TreeHeights[ID]>> {
    const path = await this.db.getSiblingPath(treeId, index);
    const key = await this.getHintKey(treeId);
    this.hints.getSiblingPathHints.push(new AvmGetSiblingPathHint(key, treeId, index, path.toFields()));
    return Promise.resolve(path);
  }

  public async getPreviousValueIndex<ID extends IndexedTreeId>(
    treeId: ID,
    value: bigint,
  ): Promise<
    | {
        index: bigint;
        alreadyPresent: boolean;
      }
    | undefined
  > {
    const result = await this.db.getPreviousValueIndex(treeId, value);
    if (result === undefined) {
      throw new Error(
        `getPreviousValueIndex(${getTreeName(
          treeId,
        )}, ${value}}) returned undefined. Possible wrong tree setup or corrupted state.`,
      );
    }
    const key = await this.getHintKey(treeId);
    this.hints.getPreviousValueIndexHints.push(
      new AvmGetPreviousValueIndexHint(key, treeId, new Fr(value), result.index, result.alreadyPresent),
    );
    return result;
  }

  public async getLeafPreimage<ID extends IndexedTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<IndexedTreeLeafPreimage | undefined> {
    const preimage = await this.db.getLeafPreimage<ID>(treeId, index);
    if (preimage) {
      const key = await this.getHintKey(treeId);

      switch (treeId) {
        case MerkleTreeId.PUBLIC_DATA_TREE:
          this.hints.getLeafPreimageHintsPublicDataTree.push(
            new AvmGetLeafPreimageHintPublicDataTree(key, index, preimage as PublicDataTreeLeafPreimage),
          );
          break;
        case MerkleTreeId.NULLIFIER_TREE:
          this.hints.getLeafPreimageHintsNullifierTree.push(
            new AvmGetLeafPreimageHintNullifierTree(key, index, preimage as NullifierLeafPreimage),
          );
          break;
        default:
          // Use getLeafValue for the other trees.
          throw new Error('getLeafPreimage only supported for PublicDataTree and NullifierTree!');
          break;
      }
    }

    return preimage;
  }

  public async getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined> {
    // Use getLeafPreimage for PublicDataTree and NullifierTree.
    assert(treeId == MerkleTreeId.NOTE_HASH_TREE || treeId == MerkleTreeId.L1_TO_L2_MESSAGE_TREE);

    const value = await this.db.getLeafValue<ID>(treeId, index);
    if (value) {
      const key = await this.getHintKey(treeId);
      // We can cast to Fr because we know the type of the tree.
      this.hints.getLeafValueHints.push(new AvmGetLeafValueHint(key, treeId, index, value as Fr));
    }

    return value;
  }

  // State modification.
  // FIXME(fcarreiro): This is a horrible interface (in the merkle ops). It's receiving the leaves as buffers,
  // from a leaf class that is NOT the one that will be used to write. Make this type safe.
  public async sequentialInsert<TreeHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>> {
    // Use appendLeaf for NoteHashTree and L1ToL2MessageTree.
    assert(treeId == MerkleTreeId.PUBLIC_DATA_TREE || treeId == MerkleTreeId.NULLIFIER_TREE);
    // We only support 1 leaf at a time for now. Can easily be extended.
    assert(leaves.length === 1, 'sequentialInsert supports only one leaf at a time!');

    const beforeState = await this.getHintKey(treeId);

    const result = await this.db.sequentialInsert<TreeHeight, ID>(treeId, leaves);

    const afterState = await this.getHintKey(treeId);
    HintingMerkleWriteOperations.logTreeChange('sequentialInsert', beforeState, afterState, treeId);

    switch (treeId) {
      case MerkleTreeId.PUBLIC_DATA_TREE:
        this.hints.sequentialInsertHintsPublicDataTree.push(
          new AvmSequentialInsertHintPublicDataTree(
            beforeState,
            afterState,
            treeId,
            PublicDataTreeLeaf.fromBuffer(leaves[0]),
            {
              leaf: result.lowLeavesWitnessData[0].leafPreimage as PublicDataTreeLeafPreimage,
              index: result.lowLeavesWitnessData[0].index,
              path: result.lowLeavesWitnessData[0].siblingPath.toFields(),
            },
            {
              leaf: result.insertionWitnessData[0].leafPreimage as PublicDataTreeLeafPreimage,
              index: result.insertionWitnessData[0].index,
              path: result.insertionWitnessData[0].siblingPath.toFields(),
            },
          ),
        );
        break;
      case MerkleTreeId.NULLIFIER_TREE:
        this.hints.sequentialInsertHintsNullifierTree.push(
          new AvmSequentialInsertHintNullifierTree(
            beforeState,
            afterState,
            treeId,
            NullifierLeaf.fromBuffer(leaves[0]),
            {
              leaf: result.lowLeavesWitnessData[0].leafPreimage as NullifierLeafPreimage,
              index: result.lowLeavesWitnessData[0].index,
              path: result.lowLeavesWitnessData[0].siblingPath.toFields(),
            },
            {
              leaf: result.insertionWitnessData[0].leafPreimage as NullifierLeafPreimage,
              index: result.insertionWitnessData[0].index,
              path: result.insertionWitnessData[0].siblingPath.toFields(),
            },
          ),
        );
        break;
      default:
        throw new Error('sequentialInsert only supported for PublicDataTree and NullifierTree!');
        break;
    }

    return result;
  }

  public async appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
    // Use sequentialInsert for PublicDataTree and NullifierTree.
    assert(treeId == MerkleTreeId.NOTE_HASH_TREE || treeId == MerkleTreeId.L1_TO_L2_MESSAGE_TREE);

    // We need to process each leaf individually because we need the sibling path after insertion, to be able to constraint the insertion.
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13380): This can be changed if the world state appendLeaves returns the sibling paths.
    if (leaves.length === 1) {
      await this.appendLeafInternal(treeId, leaves[0]);
      return;
    } else {
      // TODO(dbanks12): NON-HINTING! We skip hinting here for now because:
      // 1. We only ever append multiple leaves (for now) when padding (all empty leaves).
      // 2. We don't need hints per-item when padding.
      // 3. In order to get per-item hints today, you need to append one-at-a-time (mentioned above), which is VERY slow.
      await this.db.appendLeaves<ID>(treeId, leaves);
    }
  }

  public async createCheckpoint(): Promise<void> {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCurrentCheckpointId();
    const treesStateHash = await this.getTreesStateHash();

    await this.db.createCheckpoint();
    this.checkpointStack.push(this.nextCheckpointId++);
    const newCheckpointId = this.getCurrentCheckpointId();

    this.hints.createCheckpointHints.push(
      new AvmCreateCheckpointHint(/*actionCounter=*/ actionCounter, oldCheckpointId, newCheckpointId),
    );

    HintingMerkleWriteOperations.log.trace(
      `[createCheckpoint:${actionCounter}] Checkpoint evolved ${oldCheckpointId} -> ${newCheckpointId} at trees state ${treesStateHash}.`,
    );
  }

  public commitAllCheckpoints(): Promise<void> {
    throw new Error('commitAllCheckpoints is not supported in HintingMerkleWriteOperations.');
  }

  public revertAllCheckpoints(): Promise<void> {
    throw new Error('revertAllCheckpoints is not supported in HintingMerkleWriteOperations.');
  }

  public async commitCheckpoint(): Promise<void> {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCurrentCheckpointId();
    const treesStateHash = await this.getTreesStateHash();

    await this.db.commitCheckpoint();
    this.checkpointStack.pop();
    const newCheckpointId = this.getCurrentCheckpointId();

    this.hints.commitCheckpointHints.push(
      new AvmCommitCheckpointHint(/*actionCounter=*/ actionCounter, oldCheckpointId, newCheckpointId),
    );

    HintingMerkleWriteOperations.log.trace(
      `[commitCheckpoint:${actionCounter}] Checkpoint evolved ${oldCheckpointId} -> ${newCheckpointId} at trees state ${treesStateHash}.`,
    );
  }

  public async revertCheckpoint(): Promise<void> {
    const actionCounter = this.checkpointActionCounter++;
    const oldCheckpointId = this.getCurrentCheckpointId();
    const treesStateHash = await this.getTreesStateHash();

    const beforeState: Record<MerkleTreeId, AppendOnlyTreeSnapshot> = {
      [MerkleTreeId.PUBLIC_DATA_TREE]: await this.getHintKey(MerkleTreeId.PUBLIC_DATA_TREE),
      [MerkleTreeId.NULLIFIER_TREE]: await this.getHintKey(MerkleTreeId.NULLIFIER_TREE),
      [MerkleTreeId.NOTE_HASH_TREE]: await this.getHintKey(MerkleTreeId.NOTE_HASH_TREE),
      [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: await this.getHintKey(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
      [MerkleTreeId.ARCHIVE]: await this.getHintKey(MerkleTreeId.ARCHIVE),
    };

    await this.db.revertCheckpoint();
    this.checkpointStack.pop();
    const newCheckpointId = this.getCurrentCheckpointId();

    const afterState: Record<MerkleTreeId, AppendOnlyTreeSnapshot> = {
      [MerkleTreeId.PUBLIC_DATA_TREE]: await this.getHintKey(MerkleTreeId.PUBLIC_DATA_TREE),
      [MerkleTreeId.NULLIFIER_TREE]: await this.getHintKey(MerkleTreeId.NULLIFIER_TREE),
      [MerkleTreeId.NOTE_HASH_TREE]: await this.getHintKey(MerkleTreeId.NOTE_HASH_TREE),
      [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: await this.getHintKey(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
      [MerkleTreeId.ARCHIVE]: await this.getHintKey(MerkleTreeId.ARCHIVE),
    };

    const stateBeforeSnapshots = new TreeSnapshots(
      beforeState[MerkleTreeId.L1_TO_L2_MESSAGE_TREE],
      beforeState[MerkleTreeId.NOTE_HASH_TREE],
      beforeState[MerkleTreeId.NULLIFIER_TREE],
      beforeState[MerkleTreeId.PUBLIC_DATA_TREE],
    );

    const stateAfterSnapshots = new TreeSnapshots(
      afterState[MerkleTreeId.L1_TO_L2_MESSAGE_TREE],
      afterState[MerkleTreeId.NOTE_HASH_TREE],
      afterState[MerkleTreeId.NULLIFIER_TREE],
      afterState[MerkleTreeId.PUBLIC_DATA_TREE],
    );

    this.hints.revertCheckpointHints.push(
      new AvmRevertCheckpointHint(
        /*actionCounter=*/ actionCounter,
        oldCheckpointId,
        newCheckpointId,
        stateBeforeSnapshots,
        stateAfterSnapshots,
      ),
    );

    HintingMerkleWriteOperations.log.trace(
      `[revertCheckpoint:${actionCounter}] Checkpoint evolved ${oldCheckpointId} -> ${newCheckpointId} at trees state ${treesStateHash}.`,
    );
    for (const treeId of merkleTreeIds()) {
      HintingMerkleWriteOperations.logTreeChange('revertCheckpoint', beforeState[treeId], afterState[treeId], treeId);
    }
  }

  // Private methods.
  private async getHintKey(treeId: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(treeId);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  }

  private getCurrentCheckpointId(): number {
    return this.checkpointStack[this.checkpointStack.length - 1];
  }

  // For logging/debugging purposes.
  private async getTreesStateHash(): Promise<Fr> {
    const stateReferenceFields = (await this.db.getStateReference()).toFields();
    return Fr.fromBuffer(sha256Trunc(Buffer.concat(stateReferenceFields.map(field => field.toBuffer()))));
  }

  private static logTreeChange(
    action: string,
    beforeState: AppendOnlyTreeSnapshot,
    afterState: AppendOnlyTreeSnapshot,
    treeId: MerkleTreeId,
  ) {
    const treeName = getTreeName(treeId);
    HintingMerkleWriteOperations.log.trace(
      `[${action}] ${treeName} tree state: ${beforeState.root}, ${beforeState.nextAvailableLeafIndex} -> ${afterState.root}, ${afterState.nextAvailableLeafIndex}.`,
    );
  }

  private async appendLeafInternal<ID extends MerkleTreeId>(
    treeId: ID,
    leaf: MerkleTreeLeafType<ID>,
  ): Promise<SiblingPath<TreeHeights[ID]>> {
    // Use sequentialInsert for PublicDataTree and NullifierTree.
    assert(treeId == MerkleTreeId.NOTE_HASH_TREE || treeId == MerkleTreeId.L1_TO_L2_MESSAGE_TREE);

    const beforeState = await this.getHintKey(treeId);

    await this.db.appendLeaves<ID>(treeId, [leaf]);

    const afterState = await this.getHintKey(treeId);

    HintingMerkleWriteOperations.logTreeChange('appendLeaves', beforeState, afterState, treeId);

    this.hints.appendLeavesHints.push(new AvmAppendLeavesHint(beforeState, afterState, treeId, [leaf as Fr]));

    return await this.getSiblingPath(treeId, BigInt(beforeState.nextAvailableLeafIndex));
  }

  // Non-hinted required methods from MerkleTreeWriteOperations interface
  public async getTreeInfo(treeId: MerkleTreeId) {
    return await this.db.getTreeInfo(treeId);
  }

  public async getStateReference() {
    return await this.db.getStateReference();
  }

  public getInitialHeader() {
    return this.db.getInitialHeader();
  }

  public getRevision(): WorldStateRevision {
    return this.db.getRevision();
  }

  public async updateArchive(header: any): Promise<void> {
    return await this.db.updateArchive(header);
  }

  public async batchInsert<
    TreeHeight extends number,
    SubtreeSiblingPathHeight extends number,
    ID extends IndexedTreeId,
  >(
    treeId: ID,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    return await this.db.batchInsert<TreeHeight, SubtreeSiblingPathHeight, ID>(treeId, leaves, subtreeHeight);
  }

  public async close(): Promise<void> {
    return await this.db.close();
  }

  public async findLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<(bigint | undefined)[]> {
    return await this.db.findLeafIndices(treeId, values);
  }

  public findSiblingPaths<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<({ path: SiblingPath<TreeHeights[ID]>; index: bigint } | undefined)[]> {
    return this.db.findSiblingPaths(treeId, values);
  }

  public async findLeafIndicesAfter<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    return await this.db.findLeafIndicesAfter(treeId, values, startIndex);
  }

  public async getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    return await this.db.getBlockNumbersForLeafIndices(treeId, leafIndices);
  }
}
