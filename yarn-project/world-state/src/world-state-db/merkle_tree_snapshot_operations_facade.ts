import { MerkleTreeId, type SiblingPath } from '@aztec/circuit-types';
import {
  type IndexedTreeId,
  type MerkleTreeLeafType,
  type MerkleTreeReadOperations,
  type TreeInfo,
} from '@aztec/circuit-types/interfaces';
import {
  AppendOnlyTreeSnapshot,
  type BlockHeader,
  Fr,
  PartialStateReference,
  StateReference,
} from '@aztec/circuits.js';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { type IndexedTreeSnapshot } from '@aztec/merkle-tree';

import { type TreeSnapshots } from './merkle_tree_db.js';
import { type MerkleTrees } from './merkle_trees.js';

/**
 * Merkle tree operations on readonly tree snapshots.
 */
export class MerkleTreeSnapshotOperationsFacade implements MerkleTreeReadOperations {
  #treesDb: MerkleTrees;
  #blockNumber: number;
  #treeSnapshots: TreeSnapshots = {} as any;

  constructor(trees: MerkleTrees, blockNumber: number) {
    this.#treesDb = trees;
    this.#blockNumber = blockNumber;
  }

  async #getTreeSnapshot(treeId: MerkleTreeId): Promise<TreeSnapshots[typeof treeId]> {
    if (this.#treeSnapshots[treeId]) {
      return this.#treeSnapshots[treeId];
    }

    this.#treeSnapshots = await this.#treesDb.getTreeSnapshots(this.#blockNumber);
    return this.#treeSnapshots[treeId]!;
  }

  async findLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<(bigint | undefined)[]> {
    const tree = await this.#getTreeSnapshot(treeId);
    // TODO #5448 fix "as any"
    return values.map(leaf => tree.findLeafIndex(leaf as any));
  }

  async findLeafIndicesAfter<ID extends MerkleTreeId>(
    treeId: MerkleTreeId,
    values: MerkleTreeLeafType<ID>[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    const tree = await this.#getTreeSnapshot(treeId);
    // TODO #5448 fix "as any"
    return values.map(leaf => tree.findLeafIndexAfter(leaf as any, startIndex));
  }

  async getLeafPreimage<ID extends IndexedTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<IndexedTreeLeafPreimage | undefined> {
    const snapshot = (await this.#getTreeSnapshot(treeId)) as IndexedTreeSnapshot;
    return snapshot.getLatestLeafPreimageCopy(BigInt(index));
  }

  async getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined> {
    const snapshot = await this.#getTreeSnapshot(treeId);
    return snapshot.getLeafValue(BigInt(index)) as MerkleTreeLeafType<typeof treeId> | undefined;
  }

  async getPreviousValueIndex(
    treeId: IndexedTreeId,
    value: bigint,
  ): Promise<
    | {
        /**
         * The index of the found leaf.
         */
        index: bigint;
        /**
         * A flag indicating if the corresponding leaf's value is equal to `newValue`.
         */
        alreadyPresent: boolean;
      }
    | undefined
  > {
    const snapshot = (await this.#getTreeSnapshot(treeId)) as IndexedTreeSnapshot;
    return snapshot.findIndexOfPreviousKey(value);
  }

  async getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>> {
    const snapshot = await this.#getTreeSnapshot(treeId);
    return snapshot.getSiblingPath(index);
  }

  async getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo> {
    const snapshot = await this.#getTreeSnapshot(treeId);
    return {
      depth: snapshot.getDepth(),
      root: snapshot.getRoot(),
      size: snapshot.getNumLeaves(),
      treeId,
    };
  }

  getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(_a: ID, _b: bigint[]): Promise<(bigint | undefined)[]> {
    throw new Error('Not implemented');
  }

  async getStateReference(): Promise<StateReference> {
    const snapshots = await Promise.all([
      this.#getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE),
      this.#getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE),
      this.#getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE),
      this.#getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
      this.#getTreeSnapshot(MerkleTreeId.ARCHIVE),
    ]);

    return new StateReference(
      new AppendOnlyTreeSnapshot(
        Fr.fromBuffer(snapshots[MerkleTreeId.L1_TO_L2_MESSAGE_TREE].getRoot()),
        Number(snapshots[MerkleTreeId.L1_TO_L2_MESSAGE_TREE].getNumLeaves()),
      ),
      new PartialStateReference(
        new AppendOnlyTreeSnapshot(
          Fr.fromBuffer(snapshots[MerkleTreeId.NOTE_HASH_TREE].getRoot()),
          Number(snapshots[MerkleTreeId.NOTE_HASH_TREE].getNumLeaves()),
        ),
        new AppendOnlyTreeSnapshot(
          Fr.fromBuffer(snapshots[MerkleTreeId.NULLIFIER_TREE].getRoot()),
          Number(snapshots[MerkleTreeId.NULLIFIER_TREE].getNumLeaves()),
        ),
        new AppendOnlyTreeSnapshot(
          Fr.fromBuffer(snapshots[MerkleTreeId.PUBLIC_DATA_TREE].getRoot()),
          Number(snapshots[MerkleTreeId.PUBLIC_DATA_TREE].getNumLeaves()),
        ),
      ),
    );
  }

  getInitialHeader(): BlockHeader {
    throw new Error('Getting initial header not supported on snapshot.');
  }
}
