import { Hasher, SiblingPath } from '@aztec/types';

import { LevelUp } from 'levelup';

import { AppendOnlyTree } from '../interfaces/append_only_tree.js';
import { SiblingPathSource } from '../interfaces/merkle_tree.js';
import { TreeBase } from '../tree_base.js';
import { SnapshotBuilder } from './snapshot_builder.js';

const nodeVersionKey = (name: string, level: number, index: bigint) =>
  `snapshot:${name}:node:${level}:${index}:version`;
const nodePreviousValueKey = (name: string, level: number, index: bigint) =>
  `snapshot:${name}:node:${level}:${index}:value`;
const snapshotMetaKey = (name: string, version: number) => `snapshot:${name}:${version}`;

/**
 * A more space-efficient way of storing snapshots of AppendOnlyTrees that trades space need for slower
 * sibling path reads.
 *
 * Complexity:
 *
 * N - count of non-zero nodes in tree
 * M - count of snapshots
 * H - tree height
 *
 * Space complexity: O(N) (stores the previous value for each node and at which snapshot it was last modified)
 * Sibling path access:
 *  Best case: O(H) database reads + O(1) hashes
 *  Worst case: O(H) database reads + O(H) hashes
 */
export class AppendOnlySnapshotBuilder implements SnapshotBuilder {
  constructor(private db: LevelUp, private tree: TreeBase & AppendOnlyTree, private hasher: Hasher) {}
  async getSnapshot(version: number): Promise<SiblingPathSource> {
    const filledLeavesAtVersion = await this.#getLeafCountAtVersion(version);

    if (typeof filledLeavesAtVersion === 'undefined') {
      throw new Error(`Version ${version} does not exist for tree ${this.tree.getName()}`);
    }

    return new AppendOnlySnapshot(this.db, version, filledLeavesAtVersion, this.tree, this.hasher);
  }

  async snapshot(version: number): Promise<SiblingPathSource> {
    const leafCountAtVersion = await this.#getLeafCountAtVersion(version);
    if (typeof leafCountAtVersion !== 'undefined') {
      throw new Error(`Version ${version} of tree ${this.tree.getName()} already exists`);
    }

    const batch = this.db.batch();
    const root = this.tree.getRoot(false);
    const depth = this.tree.getDepth();
    const treeName = this.tree.getName();
    const queue: [Buffer, number, bigint][] = [[root, 0, 0n]];

    // walk the BF and update latest values
    while (queue.length > 0) {
      const [node, level, index] = queue.shift()!;

      const previousValue = await this.db.get(nodePreviousValueKey(treeName, level, index)).catch(() => undefined);
      if (!previousValue || !node.equals(previousValue)) {
        // console.log(`Node at ${level}:${index} has changed`);
        batch.put(nodeVersionKey(treeName, level, index), String(version));
        batch.put(nodePreviousValueKey(treeName, level, index), node);
      } else {
        // if this node hasn't changed, that means, nothing below it has changed either
        continue;
      }

      if (level + 1 > depth) {
        // short circuit if we've reached the leaf level
        // otherwise getNode might throw if we ask for the children of a leaf
        continue;
      }

      const [lhs, rhs] = await Promise.all([
        this.tree.getNode(level + 1, 2n * index),
        this.tree.getNode(level + 1, 2n * index + 1n),
      ]);

      if (lhs) {
        queue.push([lhs, level + 1, 2n * index]);
      }

      if (rhs) {
        queue.push([rhs, level + 1, 2n * index + 1n]);
      }
    }

    const leafCount = this.tree.getNumLeaves(false);
    batch.put(snapshotMetaKey(treeName, version), leafCount);
    await batch.write();

    return new AppendOnlySnapshot(this.db, version, leafCount, this.tree, this.hasher);
  }

  async #getLeafCountAtVersion(version: number): Promise<bigint | undefined> {
    const filledLeavesAtVersion = await this.db
      .get(snapshotMetaKey(this.tree.getName(), version))
      .then(x => BigInt(x.toString()))
      .catch(() => undefined);
    return filledLeavesAtVersion;
  }
}

/**
 * a
 */
class AppendOnlySnapshot implements SiblingPathSource {
  constructor(
    private db: LevelUp,
    private version: number,
    private leafCountAtVersion: bigint,
    private tree: TreeBase & AppendOnlyTree,
    private hasher: Hasher,
  ) {}

  public async getSiblingPath<N extends number>(index: bigint, _: boolean): Promise<SiblingPath<N>> {
    const path: Buffer[] = [];
    const depth = this.tree.getDepth();
    let level = depth;

    while (level > 0) {
      const isRight = index & 0x01n;
      const siblingIndex = isRight ? index - 1n : index + 1n;

      const sibling = await this.#getHistoricNodeValue(level, siblingIndex);
      path.push(sibling);

      level -= 1;
      index >>= 1n;
    }

    return new SiblingPath<N>(this.tree.getDepth() as N, path);
  }

  async #getHistoricNodeValue(level: number, index: bigint): Promise<Buffer> {
    const lastNodeVersion = await this.#getNodeVersion(level, index);

    // node has never been set
    if (typeof lastNodeVersion === 'undefined') {
      // console.log(`node ${level}:${index} not found, returning zero hash`);
      return this.tree.getZeroHash(level);
    }

    // node was set some time in the past
    if (lastNodeVersion <= this.version) {
      // console.log(`node ${level}:${index} unchanged ${lastNodeVersion} <= ${this.version}`);
      return this.db.get(nodePreviousValueKey(this.tree.getName(), level, index));
    }

    // the node has been modified since this snapshot was taken
    // because we're working with an AppendOnly tree, historic leaves never change
    // so what we do instead is rebuild this Merkle path up using zero hashes as needed
    // worst case this will do O(H-1) hashes
    const depth = this.tree.getDepth();
    const leafStart = index * 2n ** BigInt(depth - level);
    if (leafStart >= this.leafCountAtVersion) {
      // console.log(`subtree rooted at ${level}:${index} outside of snapshot, returning zero hash`);
      return this.tree.getZeroHash(level);
    }

    const [lhs, rhs] = await Promise.all([
      this.#getHistoricNodeValue(level + 1, 2n * index),
      this.#getHistoricNodeValue(level + 1, 2n * index + 1n),
    ]);

    // console.log(`recreating node ${level}:${index}`);
    return this.hasher.hash(lhs, rhs);
  }

  async #getNodeVersion(level: number, index: bigint): Promise<number | undefined> {
    try {
      const value: Buffer | string = await this.db.get(nodeVersionKey(this.tree.getName(), level, index));
      return parseInt(value.toString(), 10);
    } catch (err) {
      return undefined;
    }
  }
}
