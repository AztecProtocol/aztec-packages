import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { merkleTreeTestSuite } from '../test/test_suite.js';
import { SparseMerkleTree } from './sparse_tree.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { createMemDown } from '../test/utils.js';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { Pedersen } from '../pedersen.js';
import { randomBytes } from 'crypto';

const createDb = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string, depth: number) => {
  return await SparseMerkleTree.new(levelUp, hasher, name, depth);
};

const createFromName = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string) => {
  return await SparseMerkleTree.fromName(levelUp, hasher, name);
};

merkleTreeTestSuite('SparseMerkleTree', createDb, createFromName, false);
standardBasedTreeTestSuite('SparseMerkleTree', createDb, false);

describe('SparseMerkleTreeSpecific', () => {
  let wasm: BarretenbergWasm;
  let pedersen: Pedersen;

  beforeEach(async () => {
    wasm = await BarretenbergWasm.get();
    pedersen = new Pedersen(wasm);
  });

  it('throws when calling `appendLeaves`', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 32);
    expect(() => tree.appendLeaves([])).toThrow();
  });

  it('throws when index is bigger than (2^DEPTH - 1) ', async () => {
    const db = levelup(createMemDown());
    const depth = 32;
    const tree = await createDb(db, pedersen, 'test', depth);

    const index = 2n ** BigInt(depth);
    await expect(tree.updateLeaf(Buffer.alloc(32), index)).rejects.toThrow();
  });

  it('updating non-empty leaf does not change tree size', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 32);

    const randomIndex = BigInt(Math.floor(Math.random() * Number(tree.maxIndex)));
    expect(tree.getNumLeaves()).toEqual(0n);

    // Insert the leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);

    // Update the leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);
  });

  it('deleting leaf decrements tree size', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 32);

    const randomIndex = BigInt(Math.floor(Math.random() * Number(tree.maxIndex)));
    expect(tree.getNumLeaves()).toEqual(0n);

    // Insert the leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);

    // Delete the leaf
    await tree.updateLeaf(SparseMerkleTree.ZERO_ELEMENT, randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(0n);
  });
});
