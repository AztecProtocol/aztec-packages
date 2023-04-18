import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { merkleTreeTestSuite } from '../test/test_suite.js';
import { SparseMerkleTree } from './sparse_tree.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { createMemDown } from '../test/utils/create_mem_down.js';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { Pedersen } from '../pedersen.js';
import { randomBytes } from 'crypto';
import { SiblingPath } from '../index.js';
import { UpdateOnlyMerkleTree } from '../interfaces/update_only_merkle_tree.js';

const createDb = async (
  levelUp: levelup.LevelUp,
  hasher: Hasher,
  name: string,
  depth: number,
): Promise<UpdateOnlyMerkleTree> => {
  return await SparseMerkleTree.new<SparseMerkleTree>(levelUp, hasher, name, depth);
};

const createFromName = async (
  levelUp: levelup.LevelUp,
  hasher: Hasher,
  name: string,
): Promise<UpdateOnlyMerkleTree> => {
  return await SparseMerkleTree.fromName<SparseMerkleTree>(levelUp, hasher, name);
};

merkleTreeTestSuite('SparseMerkleTree', createDb, createFromName);
standardBasedTreeTestSuite('SparseMerkleTree', createDb);

describe('SparseMerkleTreeSpecific', () => {
  let wasm: BarretenbergWasm;
  let pedersen: Pedersen;

  beforeEach(async () => {
    wasm = await BarretenbergWasm.get();
    pedersen = new Pedersen(wasm);
  });

  it('throws when index is bigger than (2^DEPTH - 1) ', async () => {
    const db = levelup(createMemDown());
    const depth = 32;
    const tree = await createDb(db, pedersen, 'test', depth);

    const index = 2n ** BigInt(depth);
    await expect(tree.updateLeaf(Buffer.alloc(32), index)).rejects.toThrow();
  });

  it('updating non-empty leaf does not change tree size', async () => {
    const depth = 32;
    const maxIndex = 2 ** depth - 1;

    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', depth);

    const randomIndex = BigInt(Math.floor(Math.random() * maxIndex));
    expect(tree.getNumLeaves(false)).toEqual(0n);

    // Insert a leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);

    // Update a leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);
  });

  it('deleting leaf decrements tree size', async () => {
    const depth = 254;
    const maxIndex = 2 ** depth - 1;

    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', depth);

    const randomIndex = BigInt(Math.floor(Math.random() * maxIndex));
    expect(tree.getNumLeaves(false)).toEqual(0n);

    // Insert a leaf
    await tree.updateLeaf(randomBytes(32), randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(1n);

    // Delete a leaf
    await tree.updateLeaf(SparseMerkleTree.ZERO_ELEMENT, randomIndex);
    expect(tree.getNumLeaves(true)).toEqual(0n);
  });

  it('should have correct root and sibling path after in a "non-append-only" way', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 3);

    const zeroElement = SparseMerkleTree.ZERO_ELEMENT;
    const level2ZeroHash = pedersen.compress(zeroElement, zeroElement);
    const level1ZeroHash = pedersen.compress(level2ZeroHash, level2ZeroHash);

    expect(tree.getNumLeaves(false)).toEqual(0n);
    expect(tree.getRoot(false)).toEqual(pedersen.compress(level1ZeroHash, level1ZeroHash));

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

  it.skip('measures time of inserting 1000 leaves at random positions for depth 254', async () => {
    const depth = 254;
    const maxIndex = 2 ** depth - 1;

    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', depth);

    const leaves = Array.from({ length: 1000 }).map(() => randomBytes(32));
    const indices = Array.from({ length: 1000 }).map(() => BigInt(Math.floor(Math.random() * maxIndex)));

    const start = Date.now();
    await Promise.all(leaves.map((leaf, i) => tree.updateLeaf(leaf, indices[i])));
    const end = Date.now();
    console.log(`Inserting 1000 leaves at random positions for depth 254 took ${end - start}ms`);
  }, 300_000);
});
