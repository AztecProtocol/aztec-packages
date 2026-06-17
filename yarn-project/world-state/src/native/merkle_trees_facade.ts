import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { serializeToBuffer } from '@aztec/foundation/serialize';
import { sleep } from '@aztec/foundation/sleep';
import { type IndexedTreeLeafPreimage, SiblingPath } from '@aztec/foundation/trees';
import { BlockHash } from '@aztec/stdlib/block';
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
import type { WorldStateRevision } from '@aztec/stdlib/world-state';

import assert from 'assert';

import {
  type SerializedIndexedLeaf,
  type SerializedLeafValue,
  WorldStateMessageType,
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

  getRevision(): WorldStateRevision {
    return this.revision;
  }

  getIpcPath(): string {
    return this.instance.getIpcPath();
  }

  findLeafIndices(treeId: MerkleTreeId, values: MerkleTreeLeafType<MerkleTreeId>[]): Promise<(bigint | undefined)[]> {
    return this.findLeafIndicesAfter(treeId, values, 0n);
  }

  async findSiblingPaths<N extends number>(
    treeId: MerkleTreeId,
    values: MerkleTreeLeafType<MerkleTreeId>[],
  ): Promise<({ path: SiblingPath<N>; index: bigint } | undefined)[]> {
    const response = await this.instance.call(WorldStateMessageType.FIND_SIBLING_PATHS, {
      leaves: values.map(leaf => serializeLeaf(hydrateLeaf(treeId, leaf))),
      revision: this.revision,
      treeId,
    });

    return response.paths.map(path => {
      if (!path) {
        return undefined;
      }
      return { path: new SiblingPath<N>(path.path.length as N, path.path), index: BigInt(path.index) };
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
      return treeId === MerkleTreeId.ARCHIVE ? (new BlockHash(leaf) as any) : (leaf as any);
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
  ): Promise<(BlockNumber | undefined)[]> {
    const response = await this.instance.call(WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES, {
      treeId,
      revision: this.revision,
      leafIndices,
    });

    return response.blockNumbers.map(x => (x === undefined || x === null ? undefined : BlockNumber(Number(x))));
  }
}

export class MerkleTreesForkFacade extends MerkleTreesFacade implements MerkleTreeWriteOperations {
  private log = createLogger('world-state:merkle-trees-fork-facade');
  private closePromise: Promise<void> | undefined;

  constructor(
    instance: NativeWorldStateInstance,
    initialHeader: BlockHeader,
    revision: WorldStateRevision,
    private opts: { closeDelayMs?: number },
  ) {
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
      leaves: leaves.map(leaf => serializeLeaf(hydrateLeaf(treeId, leaf as any))),
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
        resp.subtreePath.length as any,
        resp.subtreePath,
      ),
      sortedNewLeaves: resp.sortedLeaves
        .map(([leaf]) => leaf)
        .map(deserializeLeafValue)
        .map(serializeToBuffer),
      sortedNewLeavesIndexes: resp.sortedLeaves.map(([, index]) => index),
      lowLeavesWitnessData: resp.lowLeafWitnessData.map(data => ({
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
      lowLeavesWitnessData: resp.lowLeafWitnessData.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
      insertionWitnessData: resp.insertionWitnessData.map(data => ({
        index: BigInt(data.index),
        leafPreimage: deserializeIndexedLeaf(data.leaf),
        siblingPath: new SiblingPath<TreeHeight>(data.path.length as any, data.path),
      })),
    };
  }

  public close(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    // Share the in-flight close promise across duplicate dispose calls so DELETE_FORK is sent at most once.
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closePromise = this.doClose();
    return this.closePromise;
  }

  private async doClose(): Promise<void> {
    try {
      await this.instance.call(WorldStateMessageType.DELETE_FORK, { forkId: this.revision.forkId });
    } catch (err: any) {
      // Ignore errors due to native instance being closed during shutdown.
      // This can happen when validators are still processing block proposals while the node is stopping.
      if (err?.message === 'Native instance is closed') {
        return;
      }
      // Ignore "Fork not found": the native fork was already destroyed by a pending-chain unwind or a
      // historical prune (both call C++ remove_forks_for_block). Fork IDs are monotonic and never reused,
      // so swallowing this on close cannot mask a deletion of a different fork.
      if (err?.message === 'Fork not found') {
        return;
      }
      throw err;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.opts.closeDelayMs) {
      void sleep(this.opts.closeDelayMs)
        .then(() => this.close())
        .catch(err => {
          this.log.warn('Error closing MerkleTreesForkFacade after delay', { err });
        });
    } else {
      await this.close();
    }
  }

  public async createCheckpoint(): Promise<number> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    const resp = await this.instance.call(WorldStateMessageType.CREATE_CHECKPOINT, { forkId: this.revision.forkId });
    return resp.depth;
  }

  public async commitCheckpoint(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.COMMIT_CHECKPOINT, { forkId: this.revision.forkId });
  }

  public async revertCheckpoint(): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.REVERT_CHECKPOINT, { forkId: this.revision.forkId });
  }

  public async commitAllCheckpointsTo(depth: number): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.COMMIT_ALL_CHECKPOINTS, {
      forkId: this.revision.forkId,
      depth,
    });
  }

  public async revertAllCheckpointsTo(depth: number): Promise<void> {
    assert.notEqual(this.revision.forkId, 0, 'Fork ID must be set');
    await this.instance.call(WorldStateMessageType.REVERT_ALL_CHECKPOINTS, {
      forkId: this.revision.forkId,
      depth,
    });
  }
}

function hydrateLeaf(treeId: MerkleTreeId, leaf: Fr | BlockHash | Buffer) {
  if (leaf instanceof Fr) {
    return leaf;
  } else if (leaf instanceof BlockHash) {
    return leaf.toFr();
  } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
    return NullifierLeaf.fromBuffer(leaf);
  } else if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
    return PublicDataTreeLeaf.fromBuffer(leaf);
  } else {
    return Fr.fromBuffer(leaf);
  }
}

export function serializeLeaf(leaf: Fr | BlockHash | NullifierLeaf | PublicDataTreeLeaf): SerializedLeafValue {
  if (leaf instanceof BlockHash) {
    return leaf.toBuffer();
  } else if (leaf instanceof Fr) {
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
