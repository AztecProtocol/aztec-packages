import { MerkleTreeId } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { type Bufferable, type FromBuffer } from '@aztec/foundation/serialize';
import { type AztecKVStore } from '@aztec/kv-store';
import { type Hasher } from '@aztec/types/interfaces';

import { NullifierTree, PublicDataTree, type TreeFactory } from '../interfaces/tree_factory.js';
import { Pedersen } from '../pedersen.js';
import { StandardTree } from '../standard_tree/standard_tree.js';
import { type TreeBase, getTreeMeta } from '../tree_base.js';

/**
 * Creates a new tree.
 * @param c - The class of the tree to be instantiated.
 * @param db - A database used to store the Merkle tree data.
 * @param hasher - A hasher used to compute hash paths.
 * @param name - Name of the tree.
 * @param depth - Depth of the tree.
 * @param prefilledSize - A number of leaves that are prefilled with values.
 * @returns The newly created tree.
 */
export async function newTree<T extends TreeBase<Bufferable>, D extends FromBuffer<Bufferable>>(
  c: new (store: AztecKVStore, hasher: Hasher, name: string, depth: number, size: bigint, deserializer: D) => T,
  store: AztecKVStore,
  hasher: Hasher,
  name: string,
  deserializer: D,
  depth: number,
  prefilledSize = 1,
): Promise<T> {
  const tree = new c(store, hasher, name, depth, 0n, deserializer);
  await tree.init(prefilledSize);
  return tree;
}

/**
 * Creates a new tree and sets its root, depth and size based on the meta data which are associated with the name.
 * @param c - The class of the tree to be instantiated.
 * @param db - A database used to store the Merkle tree data.
 * @param hasher - A hasher used to compute hash paths.
 * @param name - Name of the tree.
 * @returns The newly created tree.
 */
export function loadTree<T extends TreeBase<Bufferable>, D extends FromBuffer<Bufferable>>(
  c: new (
    store: AztecKVStore,
    hasher: Hasher,
    name: string,
    depth: number,
    size: bigint,
    deserializer: D,
    root: Buffer,
  ) => T,
  store: AztecKVStore,
  hasher: Hasher,
  name: string,
  deserializer: D,
): Promise<T> {
  const { root, depth, size } = getTreeMeta(store, name);
  const tree = new c(store, hasher, name, depth, size, deserializer, root);
  return Promise.resolve(tree);
}

type InitFunc = <T extends TreeBase<Bufferable>, D extends FromBuffer<Bufferable>>(
  c: new (store: AztecKVStore, hasher: Hasher, name: string, depth: number, size: bigint, deserializer: D) => T,
  store: AztecKVStore,
  hasher: Hasher,
  name: string,
  deserializer: D,
  depth: number,
  prefilledSize: number,
) => Promise<T>;

export class JSTreeFactory implements TreeFactory {
  constructor(private kvStore: AztecKVStore, private hasher: Hasher, private initFunction: InitFunc) {}

  public static init(kvStore: AztecKVStore, hasher: Hasher = new Pedersen()) {
    const factoryMethod = JSTreeFactory.isDbPopulated(kvStore) ? loadTree : newTree;
    return new JSTreeFactory(kvStore, hasher, factoryMethod);
  }
  public async createStandardTree(name: string, depth: number, prefilledSize = 1): Promise<StandardTree<Fr>> {
    return await this.initFunction(StandardTree<Fr>, this.kvStore, this.hasher, name, Fr, depth, prefilledSize);
  }
  public async createNullifierTree(name: string, depth: number, prefilledSize = 1): Promise<NullifierTree> {
    return await this.initFunction(NullifierTree, this.kvStore, this.hasher, name, {}, depth, prefilledSize);
  }
  public async createPublicDataTree(name: string, depth: number, prefilledSize = 1): Promise<PublicDataTree> {
    return await this.initFunction(PublicDataTree, this.kvStore, this.hasher, name, {}, depth, prefilledSize);
  }

  private static isDbPopulated(kvStore: AztecKVStore): boolean {
    try {
      getTreeMeta(kvStore, MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]);
      // Tree meta was found --> db is populated
      return true;
    } catch (e) {
      // Tree meta was not found --> db is not populated
      return false;
    }
  }
}
