import { LevelUp } from 'levelup';
import { TreeBase, decodeMeta } from './tree_base.js';
import { Hasher } from './hasher.js';

export abstract class TreeBaseStaticInitializable extends TreeBase {
  /**
   * Creates a new tree.
   * @param c - The class of the tree to be instantiated.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - Name of the tree.
   * @param depth - Depth of the tree.
   * @param initialLeafValue - The initial value of the leaves.
   * @returns The newly created tree.
   */
  static async new<T extends TreeBaseStaticInitializable>(
    c: new (...args: any[]) => T,
    db: LevelUp,
    hasher: Hasher,
    name: string,
    depth: number,
    initialLeafValue = TreeBaseStaticInitializable.ZERO_ELEMENT,
  ): Promise<T> {
    const tree = new c(db, hasher, name, depth, 0n, undefined, initialLeafValue);
    await tree.writeMeta();
    return tree;
  }

  /**
   * Creates a new tree and sets its root, depth and size based on the meta data which are associated with the name.
   * @param c - The class of the tree to be instantiated.
   * @param db - A database used to store the Merkle tree data.
   * @param hasher - A hasher used to compute hash paths.
   * @param name - Name of the tree.
   * @param initialLeafValue - The initial value of the leaves before assigned.
   * @returns The newly created tree.
   */
  static async fromName<T extends TreeBaseStaticInitializable>(
    c: new (...args: any[]) => T,
    db: LevelUp,
    hasher: Hasher,
    name: string,
    initialLeafValue = TreeBaseStaticInitializable.ZERO_ELEMENT,
  ): Promise<T> {
    const meta: Buffer = await db.get(name);
    const { root, depth, size } = decodeMeta(meta);
    return new c(db, hasher, name, depth, size, root, initialLeafValue);
  }
}
