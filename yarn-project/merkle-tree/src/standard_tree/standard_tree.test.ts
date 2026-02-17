import { Fr } from '@aztec/foundation/curves/bn254';
import type { FromBuffer } from '@aztec/foundation/serialize';
import type { Hasher } from '@aztec/foundation/trees';
import type { AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { loadTree } from '../load_tree.js';
import { newTree } from '../new_tree.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { treeTestSuite } from '../test/test_suite.js';
import { PoseidonWithCounter } from '../test/utils/poseidon_with_counter.js';
import { INITIAL_LEAF } from '../tree_base.js';
import { StandardTree } from './standard_tree.js';

const noopDeserializer: FromBuffer<Buffer> = {
  fromBuffer: (buffer: Buffer) => buffer,
};

const createDb = async (store: AztecKVStore, hasher: Hasher, name: string, depth: number) => {
  return await newTree(StandardTree, store, hasher, name, noopDeserializer, depth);
};

const createFromName = async (store: AztecKVStore, hasher: Hasher, name: string) => {
  return await loadTree(StandardTree, store, hasher, name, noopDeserializer);
};

treeTestSuite('StandardTree', createDb, createFromName);
standardBasedTreeTestSuite('StandardTree', createDb);

describe('StandardTree_batchAppend', () => {
  let poseidon: PoseidonWithCounter;

  beforeAll(() => {
    poseidon = new PoseidonWithCounter();
  });

  afterEach(() => {
    poseidon.resetCounter();
  });

  it('correctly computes root when batch appending and calls hash function expected num times', async () => {
    const db = openTmpStore();
    const tree = await createDb(db, poseidon, 'test', 3);
    const leaves = Array.from({ length: 5 }, _ => Fr.random().toBuffer());

    poseidon.resetCounter();
    tree.appendLeaves(leaves);

    // We append 5 leaves so to update values we do the following hashing on each level:
    //              level2Node0           level2Node1           level2Node2
    // LEVEL2: [newLeaf0, newLeaf1], [newLeaf2, newLeaf3], [newLeaf4, INITIAL_LEAF].
    //                    level1Node0                 level1Node1
    // LEVEL1:    [level2Node0, level2Node1], [level2Node2, level2ZeroHash].
    //                                       ROOT
    // LEVEL0:                   [level1Node0, level1Node1].
    const level2NumHashing = 3;
    const level1NumHashing = 2;
    const level0NumHashing = 1;
    const expectedNumHashing = level2NumHashing + level1NumHashing + level0NumHashing;

    expect(poseidon.hashCounter).toEqual(expectedNumHashing);

    const level2Node0 = poseidon.hash(leaves[0], leaves[1]);
    const level2Node1 = poseidon.hash(leaves[2], leaves[3]);
    const level2Node2 = poseidon.hash(leaves[4], INITIAL_LEAF);

    const level2ZeroHash = poseidon.hash(INITIAL_LEAF, INITIAL_LEAF);

    const level1Node0 = poseidon.hash(level2Node0, level2Node1);
    const level1Node1 = poseidon.hash(level2Node2, level2ZeroHash);

    const root = poseidon.hash(level1Node0, level1Node1);

    expect(tree.getRoot(true)).toEqual(root);
  });

  it('should be able to find indexes of leaves', async () => {
    const db = openTmpStore();
    const tree = await createDb(db, poseidon, 'test', 3);
    const values = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)];

    tree.appendLeaves([values[0]]);

    expect(tree.findLeafIndex(values[0], true)).toBeDefined();
    expect(tree.findLeafIndex(values[0], false)).toBe(undefined);
    expect(tree.findLeafIndex(values[1], true)).toBe(undefined);

    await tree.commit();

    expect(tree.findLeafIndex(values[0], false)).toBeDefined();
  });
});
