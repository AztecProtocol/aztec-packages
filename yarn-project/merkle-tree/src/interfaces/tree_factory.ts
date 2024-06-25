import {
  type Fr,
  NullifierLeaf,
  NullifierLeafPreimage,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { type AztecKVStore } from '@aztec/kv-store';
import { type Hasher } from '@aztec/types/interfaces';

import { StandardIndexedTree } from '../standard_indexed_tree/standard_indexed_tree.js';
import { type StandardTree } from '../standard_tree/standard_tree.js';

/**
 * The nullifier tree is an indexed tree.
 */
export class NullifierTree extends StandardIndexedTree {
  constructor(
    store: AztecKVStore,
    hasher: Hasher,
    name: string,
    depth: number,
    size: bigint = 0n,
    _noop: any,
    root?: Buffer,
  ) {
    super(store, hasher, name, depth, size, NullifierLeafPreimage, NullifierLeaf, root);
  }
}

/**
 * The public data tree is an indexed tree.
 */
export class PublicDataTree extends StandardIndexedTree {
  constructor(
    store: AztecKVStore,
    hasher: Hasher,
    name: string,
    depth: number,
    size: bigint = 0n,
    _noop: any,
    root?: Buffer,
  ) {
    super(store, hasher, name, depth, size, PublicDataTreeLeafPreimage, PublicDataTreeLeaf, root);
  }
}

export interface TreeFactory {
  createStandardTree(name: string, depth: number, prefilledSize: number): Promise<StandardTree<Fr>>;
  createNullifierTree(name: string, depth: number, prefilledSize: number): Promise<NullifierTree>;
  createPublicDataTree(name: string, depth: number, prefilledSize: number): Promise<PublicDataTree>;
}
