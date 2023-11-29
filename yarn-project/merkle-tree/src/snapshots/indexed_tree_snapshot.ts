import { LevelUp, LevelUpChain } from 'levelup';

import { IndexedTree, LeafData } from '../interfaces/indexed_tree.js';
import { decodeTreeValue, encodeTreeValue } from '../standard_indexed_tree/standard_indexed_tree.js';
import { TreeBase } from '../tree_base.js';
import { BaseFullTreeSnapshot, BaseFullTreeSnapshotBuilder } from './base_full_snapshot.js';
import { IndexedTreeSnapshot, TreeSnapshotBuilder } from './snapshot_builder.js';

const snapshotLeafValue = (node: Buffer, index: bigint) =>
  Buffer.concat([Buffer.from('snapshot:leaf:'), node, Buffer.from(':' + index)]);

/** a */
export class IndexedTreeSnapshotBuilder
  extends BaseFullTreeSnapshotBuilder<IndexedTree & TreeBase, IndexedTreeSnapshot>
  implements TreeSnapshotBuilder<IndexedTreeSnapshot>
{
  constructor(db: LevelUp, tree: IndexedTree & TreeBase) {
    super(db, tree);
  }

  protected openSnapshot(root: Buffer): IndexedTreeSnapshot {
    return new IndexedTreeSnapshotImpl(this.db, root, this.tree);
  }

  protected handleLeaf(index: bigint, node: Buffer, batch: LevelUpChain) {
    const leafData = this.tree.getLatestLeafDataCopy(Number(index), false);
    if (leafData) {
      batch.put(snapshotLeafValue(node, index), encodeTreeValue(leafData));
    }
  }
}

/** A snapshot of an indexed tree at a particular point in time */
class IndexedTreeSnapshotImpl extends BaseFullTreeSnapshot implements IndexedTreeSnapshot {
  async getLatestLeafDataCopy(index: bigint): Promise<LeafData | undefined> {
    let leafNode: Buffer;
    for await (const [node, _sibling] of this.pathFromRootToLeaf(index)) {
      leafNode = node;
    }

    const leafValue = await this.db.get(snapshotLeafValue(leafNode!, index)).catch(() => undefined);
    if (leafValue) {
      return decodeTreeValue(leafValue);
    } else {
      return undefined;
    }
  }
}
