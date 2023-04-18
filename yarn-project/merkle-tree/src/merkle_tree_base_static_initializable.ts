import { LevelUp } from 'levelup';
import { MerkleTreeBase, decodeMeta } from './merkle_tree_base.js';
import { Hasher } from './hasher.js';

export abstract class MerkleTreeBaseStaticInitializable extends MerkleTreeBase {
  /**
   * Creates a new tree.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - Name of the tree.
   * @param depth - Depth of the tree.
   * @param initialLeafValue - The initial value of the leaves.
   * @returns The newly created tree.
   */
  static async new<T extends MerkleTreeBaseStaticInitializable>(
    db: LevelUp,
    hasher: Hasher,
    name: string,
    depth: number,
    initialLeafValue = MerkleTreeBaseStaticInitializable.ZERO_ELEMENT,
  ): Promise<T> {
    const tree = Reflect.construct(this, [db, hasher, name, depth, 0n, undefined, initialLeafValue]) as T;
    await tree.writeMeta();
    return tree;
  }

  /**
   * Creates a new tree and sets its root, depth and size based on the meta data which are associated with the name.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - Name of the tree.
   * @param initialLeafValue - The initial value of the leaves before assigned.
   * @returns The newly created tree.
   */
  static async fromName<T extends MerkleTreeBaseStaticInitializable>(
    db: LevelUp,
    hasher: Hasher,
    name: string,
    initialLeafValue = MerkleTreeBaseStaticInitializable.ZERO_ELEMENT,
  ): Promise<T> {
    const meta: Buffer = await db.get(name);
    const { root, depth, size } = decodeMeta(meta);
    return Reflect.construct(this, [db, hasher, name, depth, size, root, initialLeafValue]) as T;
  }
}
