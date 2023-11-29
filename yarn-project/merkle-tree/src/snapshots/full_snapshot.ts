import { SiblingPath } from '@aztec/types';

import { LevelUp } from 'levelup';

import { SiblingPathSource } from '../interfaces/merkle_tree.js';
import { TreeBase } from '../tree_base.js';
import { SnapshotBuilder } from './snapshot_builder.js';

// ket for a node's children
const snapshotChildKey = (node: Buffer, child: 0 | 1) =>
  Buffer.concat([Buffer.from('snapshot:node:'), node, Buffer.from(':' + child)]);

// metadata for a snapshot - the root of the historical tree
const snapshotRootKey = (treeName: string, block: number) => `snapshot:root:${treeName}:${block}`;

/**
 * Builds a full snapshot of a tree. This implementation works for any Merkle tree and stores
 * it in a database in a similar way to how a tree is stored in memory, using pointers.
 *
 * Sharing the same database between versions and trees is recommended as the trees would share
 * structure.
 *
 * Complexity:
 * N - count of non-zero nodes in tree
 * M - count of snapshots
 * H - tree height
 * Worst case space complexity: O(N * M)
 * Sibling path access: O(H) database reads
 */
export class FullSnapshotBuilder implements SnapshotBuilder {
  constructor(private db: LevelUp, private tree: TreeBase) {}

  async snapshot(block: number): Promise<SiblingPathSource> {
    const historicalRoot = await this.#getRootAtBlock(block);

    if (historicalRoot) {
      return new FullSnapshot(this.db, historicalRoot, this.tree);
    }

    const batch = this.db.batch();
    const root = this.tree.getRoot(false);
    const depth = this.tree.getDepth();
    const queue: [Buffer, number, bigint][] = [[root, 0, 0n]];

    // walk the tree breadth-first and store each of its nodes in the database
    // for each node we save two keys
    //   <node hash>:0 -> <left child's hash>
    //   <node hash>:1 -> <right child's hash>
    while (queue.length > 0) {
      const [node, level, i] = queue.shift()!;
      // check if the database already has a child for this tree
      // if it does, then we know we've seen the whole subtree below it before
      // and we don't have to traverse it anymore
      // we use the left child here, but it could be anything that shows we've stored the node before
      const exists: Buffer | undefined = await this.db.get(snapshotChildKey(node, 0)).catch(() => undefined);
      if (exists) {
        continue;
      }

      if (level + 1 > depth) {
        // short circuit if we've reached the leaf level
        // otherwise getNode might throw if we ask for the children of a leaf
        continue;
      }

      const [lhs, rhs] = await Promise.all([
        this.tree.getNode(level + 1, 2n * i),
        this.tree.getNode(level + 1, 2n * i + 1n),
      ]);

      // we want the zero hash at the children's level, not the node's level
      const zeroHash = this.tree.getZeroHash(level + 1);

      batch.put(snapshotChildKey(node, 0), lhs ?? zeroHash);
      batch.put(snapshotChildKey(node, 1), rhs ?? zeroHash);

      // enqueue the children only if they're not zero hashes
      if (lhs) {
        queue.push([lhs, level + 1, 2n * i]);
      }

      if (rhs) {
        queue.push([rhs, level + 1, 2n * i + 1n]);
      }
    }

    batch.put(snapshotRootKey(this.tree.getName(), block), root);
    await batch.write();

    return new FullSnapshot(this.db, root, this.tree);
  }

  async getSnapshot(version: number): Promise<SiblingPathSource> {
    const historicRoot = await this.#getRootAtBlock(version);

    if (!historicRoot) {
      throw new Error(`Version ${version} does not exist for tree ${this.tree.getName()}`);
    }

    return new FullSnapshot(this.db, historicRoot, this.tree);
  }

  async #getRootAtBlock(version: number): Promise<Buffer | undefined> {
    try {
      return await this.db.get(snapshotRootKey(this.tree.getName(), version));
    } catch (err) {
      return undefined;
    }
  }
}

/**
 * A source of sibling paths from a snapshot tree
 */
class FullSnapshot implements SiblingPathSource {
  constructor(private db: LevelUp, private historicRoot: Buffer, private tree: TreeBase) {}

  async getSiblingPath<N extends number>(index: bigint): Promise<SiblingPath<N>> {
    const root = this.historicRoot;
    const pathFromRoot = this.#getPathFromRoot(index);
    const siblings: Buffer[] = [];

    let node: Buffer = root;
    for (let i = 0; i < pathFromRoot.length; i++) {
      // get both children. We'll need both anyway (one to keep track of, the other to walk down to)
      const children: [Buffer, Buffer] = await Promise.all([
        this.db.get(snapshotChildKey(node, 0)),
        this.db.get(snapshotChildKey(node, 1)),
      ]).catch(() => [this.tree.getZeroHash(i + 1), this.tree.getZeroHash(i + 1)]);
      const next = children[pathFromRoot[i]];
      const sibling = children[(pathFromRoot[i] + 1) % 2];

      siblings.push(sibling);
      node = next;
    }

    // we got the siblings we were looking for, but they are in root-leaf order
    // reverse them here so we have leaf-root (what SiblingPath expects)
    siblings.reverse();

    return new SiblingPath<N>(this.tree.getDepth() as N, siblings);
  }

  /**
   * Calculates the path from the root to the target leaf. Returns an array of 0s and 1s,
   * each 0 represents walking down a left child and each 1 walking down to the child on the right.
   *
   * @param leafIndex - The target leaf
   * @returns An array of 0s and 1s
   */
  #getPathFromRoot(leafIndex: bigint): ReadonlyArray<0 | 1> {
    const path: Array<0 | 1> = [];
    let level = this.tree.getDepth();
    while (level > 0) {
      path.push(leafIndex & 0x01n ? 1 : 0);
      leafIndex >>= 1n;
      level--;
    }

    path.reverse();
    return path;
  }
}
