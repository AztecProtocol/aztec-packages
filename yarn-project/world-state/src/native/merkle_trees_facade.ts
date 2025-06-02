import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { type IndexedTreeLeafPreimage, SiblingPath } from '@aztec/foundation/trees';
import type {
  BatchInsertionResult,
  IndexedTreeId,
  MerkleTreeLeafType,
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
  SequentialInsertionResult,
  TreeInfo,
} from '@aztec/stdlib/interfaces/server';
import {
  MerkleTreeId,
  NullifierLeaf,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { type BlockHeader, PartialStateReference, StateReference } from '@aztec/stdlib/tx';

import assert from 'assert';

import {
  type SerializedIndexedLeaf,
  type SerializedLeafValue,
  WorldStateMessageType,
  type WorldStateRevision,
  blockStateReference,
  treeStateReferenceToSnapshot,
} from './message.js';
import type { NativeWorldStateInstance } from './native_world_state_instance.js';

export class MerkleTreesFacade implements MerkleTreeReadOperations {
  constructor(
    protected readonly instance: NativeWorldStateInstance,
    protected readonly initialHeader: BlockHeader,
    protected readonly revision: WorldStateRevision,
  ) {}

  getInitialHeader(): BlockHeader {
    return this.initialHeader;
  }

  findLeafIndices(treeId: MerkleTreeId, values: MerkleTreeLeafType<MerkleTreeId>[]): Promise<(bigint | undefined)[]> {
    return this.findLeafIndicesAfter(treeId, values, 0n);
  }

  async findSiblingPaths<N extends number>(
    treeId: MerkleTreeId,
    values: MerkleTreeLeafType<MerkleTreeId>[],
  ): Promise<(SiblingPath<N> | undefined)[]> {
    const response = await this.instance.call(WorldStateMessageType.FIND_SIBLING_PATHS, {
      leaves: values.map(leaf => serializeLeaf(hydrateLeaf(treeId, leaf))),
      revision: this.revision,
      treeId,
    });

    return response.paths.map(path => {
      if (!path) {
        return undefined;
      }
      return new SiblingPath(path.length, path) as any;
    });
  }

  async findLeafIndicesAfter(
    treeId: MerkleTreeId,
    leaves: MerkleTreeLeafType<MerkleTreeId>[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    const response = await this.instance.call(WorldStateMessageType.FIND_LEAF_INDICES, {
      leaves: leaves.map(leaf => serializeLeaf(hydrateLeaf(treeId, leaf))),
      revision: this.revision,
      treeId,
      startIndex,
    });

    return response.indices.map(index => {
      if (typeof index === 'number' || typeof index === 'bigint') {
        return BigInt(index);
      } else {
        return undefined;
      }
    });
  }

  async getLeafPreimage(treeId: IndexedTreeId, leafIndex: bigint): Promise<IndexedTreeLeafPreimage | undefined> {
    const resp = await this.instance.call(WorldStateMessageType.GET_LEAF_PREIMAGE, {
      leafIndex,
      revision: this.revision,
      treeId,
    });

    return resp ? deserializeIndexedLeaf(resp) : undefined;
  }

  async getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndex: bigint,
  ): Promise<MerkleTreeLeafType<ID> | undefined> {
    const resp = await this.instance.call(WorldStateMessageType.GET_LEAF_VALUE, {
      leafIndex,
      revision: this.revision,
      treeId,
    });

    if (!resp) {
      return undefined;
    }

    const leaf = deserializeLeafValue(resp);
    if (leaf instanceof Fr) {
      return leaf as any;
    } else {
      return leaf.toBuffer() as any;
    }
  }

  async getPreviousValueIndex(
    treeId: IndexedTreeId,
    value: bigint,
  ): Promise<{ index: bigint; alreadyPresent: boolean } | undefined> {
    const resp = await this.instance.call(WorldStateMessageType.FIND_LOW_LEAF, {
      key: new Fr(value),
      revision: this.revision,
      treeId,
    });
    return {
      alreadyPresent: resp.alreadyPresent,
      index: BigInt(resp.index),
    };
  }

  async getSiblingPath<N extends number>(treeId: MerkleTreeId, leafIndex: bigint): Promise<SiblingPath<N>> {
    const siblingPath = await this.instance.call(WorldStateMessageType.GET_SIBLING_PATH, {
      leafIndex,
      revision: this.revision,
      treeId,
    });

    return new SiblingPath(siblingPath.length, siblingPath) as any;
  }

  async getStateReference(): Promise<StateReference> {
    const resp = await this.instance.call(WorldStateMessageType.GET_STATE_REFERENCE, {
      revision: this.revision,
    });

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  async getInitialStateReference(): Promise<StateReference> {
    const resp = await this.instance.call(WorldStateMessageType.GET_INITIAL_STATE_REFERENCE, { canonical: true });

    return new StateReference(
      treeStateReferenceToSnapshot(resp.state[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]),
      new PartialStateReference(
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NOTE_HASH_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.NULLIFIER_TREE]),
        treeStateReferenceToSnapshot(resp.state[MerkleTreeId.PUBLIC_DATA_TREE]),
      ),
    );
  }

  async getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo> {
    const resp = await this.instance.call(WorldStateMessageType.GET_TREE_INFO, {
      treeId: treeId,
      revision: this.revision,
    });

    return {
      depth: resp.depth,
      root: resp.root,
      size: BigInt(resp.size),
      treeId,
    };
  }

  async getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    const response = await this.instance.call(WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES, {
      treeId,
      revision: this.revision,
      leafIndices,
    });

    return response.blockNumbers.map(x => (x === undefined || x === null ? undefined : BigInt(x)));
  }
}

export class MerkleTreesForkFacade extends MerkleTreesFacade implements MerkleTreeWriteOperations {
  constructor(instance: NativeWorldStateInstance, initialHeader: BlockHeader, revision: WorldStateRevision) {
    assert.notEqual(revision.forkId, 0, 'Fork ID must be set');
    assert.equal(revision.includeUncommitted, true, 'Fork must include uncommitted data');
    super(instance, initialHeader, revision);
  }
  async updateArchive(header: BlockHeader): Promise<void> {
    await this.instance.call(WorldStateMessageType.UPDATE_ARCHIVE, {
      forkId: this.revision.forkId,
      blockHeaderHash: (await header.hash()).toBuffer(),
      blockStateRef: blockStateReference(header.state),
    });
  }

  async appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
    await this.instance.call(WorldStateMessageType.APPEND_LEAVES, {
      leaves: leaves.map(leaf => leaf as any),
      forkId: this.revision.forkId,
      treeId,
    });
  }

  async batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    rawLeaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    const leaves = rawLeaves.map((leaf: Buffer) => hydrateLeaf(treeId, leaf)).map(serializeLeaf);
    const resp = await this.instance.call(WorldStateMessageType.BATCH_INSERT, {
      leaves,
      treeId,
      forkId: this.revision.forkId,
      subtreeDepth: subtreeHeight,
    });

    return {
      newSubtreeSiblingPath: new SiblingPath<SubtreeSiblingPathHeight>(
        resp.subtree_path.length as any,
        resp.subtree_path,
      ),
      sortedNewLeaves: resp.sorted_leaves
        .map(([leaf]) => leaf)
        .map(deserializeLeafValue)
        .map(serializeToBuffer),
      sortedNewLeavesIndexes: resp.sorted_leaves.map(([, index]) => index),
      lowLeavesWitnessData: resp.low_leaf_witness_data.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
    };
  }

  async sequentialInsert<TreeHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    rawLeaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>> {
    const leaves = rawLeaves.map((leaf: Buffer) => hydrateLeaf(treeId, leaf)).map(serializeLeaf);
    const resp = await this.instance.call(WorldStateMessageType.SEQUENTIAL_INSERT, {
      leaves,
      treeId,
      forkId: this.revision.forkId,
    });

    return {
      lowLeavesWitnessData: resp.low_leaf_witness_data.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
      insertionWitnessData: resp.insertion_witness_data.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
    };
  }

  public async close(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.DELETE_FORK, { forkId: this.revision.forkId });
  }

  public async createCheckpoint(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.CREATE_CHECKPOINT, { forkId: this.revision.forkId });
  }

  public async commitCheckpoint(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.COMMIT_CHECKPOINT, { forkId: this.revision.forkId });
  }

  public async revertCheckpoint(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.REVERT_CHECKPOINT, { forkId: this.revision.forkId });
  }

  public async commitAllCheckpoints(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.COMMIT_ALL_CHECKPOINTS, { forkId: this.revision.forkId });
  }

  public async revertAllCheckpoints(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.REVERT_ALL_CHECKPOINTS, { forkId: this.revision.forkId });
  }
}

function hydrateLeaf<ID extends MerkleTreeId>(treeId: ID, leaf: Fr | Buffer) {
  if (leaf instanceof Fr) {
    return leaf;
  } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
    return NullifierLeaf.fromBuffer(leaf);
  } else if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
    return PublicDataTreeLeaf.fromBuffer(leaf);
  } else {
    return Fr.fromBuffer(leaf);
  }
}

export function serializeLeaf(leaf: Fr | NullifierLeaf | PublicDataTreeLeaf): SerializedLeafValue {
  if (leaf instanceof Fr) {
    return leaf.toBuffer();
  } else if (leaf instanceof NullifierLeaf) {
    return { nullifier: leaf.nullifier.toBuffer() };
  } else {
    return { value: leaf.value.toBuffer(), slot: leaf.slot.toBuffer() };
  }
}

function deserializeLeafValue(leaf: SerializedLeafValue): Fr | NullifierLeaf | PublicDataTreeLeaf {
  if (Buffer.isBuffer(leaf)) {
    return Fr.fromBuffer(leaf);
  } else if ('slot' in leaf) {
    return new PublicDataTreeLeaf(Fr.fromBuffer(leaf.slot), Fr.fromBuffer(leaf.value));
  } else {
    return new NullifierLeaf(Fr.fromBuffer(leaf.nullifier));
  }
}

function deserializeIndexedLeaf(leafPreimage: SerializedIndexedLeaf): IndexedTreeLeafPreimage {
  if ('slot' in leafPreimage.leaf) {
    return new PublicDataTreeLeafPreimage(
      new PublicDataTreeLeaf(Fr.fromBuffer(leafPreimage.leaf.slot), Fr.fromBuffer(leafPreimage.leaf.value)),
      Fr.fromBuffer(leafPreimage.nextKey),
      BigInt(leafPreimage.nextIndex),
    );
  } else if ('nullifier' in leafPreimage.leaf) {
    return new NullifierLeafPreimage(
      new NullifierLeaf(Fr.fromBuffer(leafPreimage.leaf.nullifier)),
      Fr.fromBuffer(leafPreimage.nextKey),
      BigInt(leafPreimage.nextIndex),
    );
  } else {
    throw new Error('Invalid leaf type');
  }
}
