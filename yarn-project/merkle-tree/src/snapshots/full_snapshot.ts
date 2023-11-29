import { SiblingPathSource } from '../interfaces/merkle_tree.js';
import { TreeBase } from '../tree_base.js';
import { BaseFullTreeSnapshot, BaseFullTreeSnapshotBuilder } from './base_full_snapshot.js';
import { TreeSnapshotBuilder } from './snapshot_builder.js';

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
export class FullTreeSnapshotBuilder
  extends BaseFullTreeSnapshotBuilder<TreeBase, SiblingPathSource>
  implements TreeSnapshotBuilder<SiblingPathSource>
{
  protected openSnapshot(root: Buffer): SiblingPathSource {
    return new BaseFullTreeSnapshot(this.db, root, this.tree);
  }
}
