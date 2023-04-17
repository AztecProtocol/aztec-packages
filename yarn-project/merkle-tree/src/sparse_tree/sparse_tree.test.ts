import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { merkleTreeTestSuite } from '../test/test_suite.js';
import { SparseMerkleTree } from './sparse_tree.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { createMemDown } from '../test/utils.js';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { Pedersen } from '../pedersen.js';
import { randomBytes } from 'crypto';
import { SiblingPath } from '../index.js';

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

  it('should have correct root and sibling path after in a "non-append-only" way', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 3);

    const zeroElement = SparseMerkleTree.ZERO_ELEMENT;
    const level2ZeroHash = pedersen.compress(zeroElement, zeroElement);
    const level1ZeroHash = pedersen.compress(level2ZeroHash, level2ZeroHash);

    expect(tree.getNumLeaves()).toEqual(0n);
    expect(tree.getRoot()).toEqual(pedersen.compress(level1ZeroHash, level1ZeroHash));

    // Insert leaf at index 3
    let level1LeftHash: Buffer;
    const leafAtIndex3 = randomBytes(32);
    {
      await tree.updateLeaf(leafAtIndex3, 3n);
      expect(tree.getNumLeaves(true)).toEqual(1n);
      const level2Hash = pedersen.compress(zeroElement, leafAtIndex3);
      level1LeftHash = pedersen.compress(level2ZeroHash, level2Hash);
      const root = pedersen.compress(level1LeftHash, level1ZeroHash);
      expect(tree.getRoot(true)).toEqual(root);
      expect(await tree.getSiblingPath(3n, true)).toEqual(
        new SiblingPath([zeroElement, level2ZeroHash, level1ZeroHash]),
      );
    }

    // Insert leaf at index 6
    let level1RightHash: Buffer;
    {
      const leafAtIndex6 = randomBytes(32);
      await tree.updateLeaf(leafAtIndex6, 6n);
      expect(tree.getNumLeaves(true)).toEqual(2n);
      const level2Hash = pedersen.compress(leafAtIndex6, zeroElement);
      level1RightHash = pedersen.compress(level2ZeroHash, level2Hash);
      const root = pedersen.compress(level1LeftHash, level1RightHash);
      expect(tree.getRoot(true)).toEqual(root);
      expect(await tree.getSiblingPath(6n, true)).toEqual(
        new SiblingPath([zeroElement, level2ZeroHash, level1LeftHash]),
      );
    }

    // Insert leaf at index 2
    const leafAtIndex2 = randomBytes(32);
    {
      await tree.updateLeaf(leafAtIndex2, 2n);
      expect(tree.getNumLeaves(true)).toEqual(3n);
      const level2Hash = pedersen.compress(leafAtIndex2, leafAtIndex3);
      level1LeftHash = pedersen.compress(level2ZeroHash, level2Hash);
      const root = pedersen.compress(level1LeftHash, level1RightHash);
      expect(tree.getRoot(true)).toEqual(root);
      expect(await tree.getSiblingPath(2n, true)).toEqual(
        new SiblingPath([leafAtIndex3, level2ZeroHash, level1RightHash]),
      );
    }

    // Updating leaf at index 3
    {
      const updatedLeafAtIndex3 = randomBytes(32);
      await tree.updateLeaf(updatedLeafAtIndex3, 3n);
      expect(tree.getNumLeaves(true)).toEqual(3n);
      const level2Hash = pedersen.compress(leafAtIndex2, updatedLeafAtIndex3);
      level1LeftHash = pedersen.compress(level2ZeroHash, level2Hash);
      const root = pedersen.compress(level1LeftHash, level1RightHash);
      expect(tree.getRoot(true)).toEqual(root);
      expect(await tree.getSiblingPath(3n, true)).toEqual(
        new SiblingPath([leafAtIndex2, level2ZeroHash, level1RightHash]),
      );
    }
  });
});
