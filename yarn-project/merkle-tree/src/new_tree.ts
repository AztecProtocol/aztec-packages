import type { Logger } from '@aztec/foundation/log';
import type { Bufferable, FromBuffer } from '@aztec/foundation/serialize';
import type { Hasher } from '@aztec/foundation/trees';
import type { AztecKVStore } from '@aztec/kv-store';

import type { TreeBase } from './tree_base.js';

/**
 * Creates a new tree.
 * @param c - The class of the tree to be instantiated.
 * @param db - A database used to store the Merkle tree data.
 * @param hasher - A hasher used to compute hash paths.
 * @param name - Name of the tree.
 * @param deserializer - A deserializer for the leaf values.
 * @param depth - Depth of the tree.
 * @param logger - A logger to use for logging.
 * @param prefilledSize - A number of leaves that are prefilled with values.
 * @returns The newly created tree.
 */
export async function newTree<T extends TreeBase<Bufferable>, D extends FromBuffer<Bufferable>>(
  c: new (
    store: AztecKVStore,
    hasher: Hasher,
    name: string,
    depth: number,
    size: bigint,
    deserializer: D,
    logger: Logger,
  ) => T,
  store: AztecKVStore,
  hasher: Hasher,
  name: string,
  deserializer: D,
  depth: number,
  logger: Logger,
  prefilledSize = 1,
): Promise<T> {
  const tree = new c(store, hasher, name, depth, 0n, deserializer, logger);
  await tree.init(prefilledSize);
  return tree;
}
