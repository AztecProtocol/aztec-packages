import { default as levelup } from 'levelup';
import { default as memdown } from 'memdown';
import { SiblingPath, StandardMerkleTree } from './index.js';
import { SinglePedersen } from '../crypto/index.js';
import { BarretenbergWasm } from '../wasm/index.js';

// const expectSameTrees = async (tree1: MerkleTree, tree2: MerkleTree) => {
//   const size = tree1.getNumLeaves();
//   expect(size).toBe(tree2.getNumLeaves());
//   expect(tree1.getRoot().toString('hex')).toBe(tree2.getRoot().toString('hex'));

//   for (let i = 0; i < size; ++i) {
//     const siblingPath1 = await tree1.getSiblingPath(BigInt(i));
//     const siblingPath2 = await tree2.getSiblingPath(BigInt(i));
//     expect(siblingPath2).toStrictEqual(siblingPath1);
//   }
// };

describe('merkle_tree', () => {
  let barretenberg!: BarretenbergWasm;
  let pedersen!: SinglePedersen;
  const values: Buffer[] = [];

  beforeAll(async () => {
    barretenberg = new BarretenbergWasm();
    await barretenberg.init();
    pedersen = new SinglePedersen(barretenberg);

    for (let i = 0; i < 32; ++i) {
      const v = Buffer.alloc(32, 0);
      v.writeUInt32BE(i, 28);
      values[i] = v;
    }
  });

  it('should have correct root', async () => {
    const db = levelup(memdown());

    const e00 = StandardMerkleTree.ZERO_ELEMENT;
    const e01 = values[1];
    const e02 = values[2];
    const e03 = values[3];
    const e10 = pedersen.compress(e00, e01);
    const e11 = pedersen.compress(e02, e03);
    const root = pedersen.compress(e10, e11);

    const tree = await StandardMerkleTree.new(db, pedersen, 'test', 2);

    await tree.appendLeaves(values.slice(0, 4));

    expect(await tree.getSiblingPath(0n)).toEqual(new SiblingPath([e01, e11]));
    expect(await tree.getSiblingPath(1n)).toEqual(new SiblingPath([e00, e11]));

    expect(await tree.getSiblingPath(0n)).toEqual(new SiblingPath([e02, e10]));
    expect(await tree.getSiblingPath(1n)).toEqual(new SiblingPath([e03, e10]));
    expect(tree.getRoot()).toEqual(root);
    expect(tree.getNumLeaves()).toBe(4);

    // Lifted from memory_tree.test.cpp to ensure consistency.
    expect(root.toString('hex')).toEqual('0bf2e78afd70f72b0e6eafb03c41faef167a82441b05e517cdf35d813302061f');
  });

  // it('should have correct empty tree root for depth 32', async () => {
  //   const db = levelup(memdown());
  //   const tree = await MerkleTree.new(db, pedersen, 'test', 32);
  //   const root = tree.getRoot();
  //   expect(root.toString('hex')).toEqual('18ceb5cd201e1cee669a5c3ad96d3c4e933a365b37046fc3178264bede32c68d');
  // });

  // it('should have same result when setting same values', async () => {
  //   const db = levelup(memdown());
  //   const tree = await MerkleTree.new(db, pedersen, 'test', 10);

  //   for (let i = 0; i < values.length; ++i) {
  //     await tree.updateElement(i, values[i]);
  //   }
  //   const root1 = tree.getRoot();

  //   for (let i = 0; i < values.length; ++i) {
  //     await tree.updateElement(i, values[i]);
  //   }
  //   const root2 = tree.getRoot();

  //   expect(root1).toEqual(root2);
  // });

  // it('should get same result when using subtree insertion', async () => {
  //   const values: Buffer[] = [];
  //   for (let i = 0; i < 32 * 8; ++i) {
  //     const v = Buffer.alloc(32, 0);
  //     v.writeUInt32BE(i, 28);
  //     values[i] = v;
  //   }

  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   for (let i = 0; i < values.length; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   // Create tree from subtrees.
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   for (let i = 0; i < values.length; i += 32) {
  //     await tree2.updateElements(i, values.slice(i, i + 32));
  //   }

  //   await expectSameTrees(tree1, tree2);
  // });
  // it('should support batch insertion of a single element', async () => {
  //   const values: Buffer[] = [];
  //   for (let i = 0; i < 32 * 2; ++i) {
  //     const v = Buffer.alloc(32, 0);
  //     v.writeUInt32BE(i, 28);
  //     values[i] = v;
  //   }

  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   for (let i = 0; i < values.length; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   // Create tree from subtrees.
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   for (let i = 0; i < values.length; i++) {
  //     await tree2.updateElements(i, values.slice(i, i + 1));
  //   }

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should update elements without over extending tree size', async () => {
  //   // Create reference tree from 12 values.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   for (let i = 0; i < 29; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   // Results in subtree insertion of 4, 2 and 1.
  //   await tree2.updateElements(0, values.slice(0, 7));
  //   // Results in subtree insertion of 16, 4 and 2.
  //   await tree2.updateElements(7, values.slice(7, 29));

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should update elements, simulating escape hatch behaviour', async () => {
  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   for (let i = 0; i < 10; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }
  //   for (let i = 16; i < 24; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   // Create tree from 4 rollup, 1 escape, 4 rollup.
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   await tree2.updateElements(0, values.slice(0, 8));
  //   await tree2.updateElements(8, values.slice(8, 10));
  //   await tree2.updateElements(16, values.slice(16, 24));

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should update 0 values elements', async () => {
  //   const values: Buffer[] = Array(6).fill(Buffer.alloc(32, 0));

  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   for (let i = 0; i < 6; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   // Create tree from 8 rollup, 1 escape, 8 rollup.
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   await tree2.updateElements(0, values.slice(0, 6));
  //   expect(tree2.getSize()).toEqual(6);

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should allow inserting same subtree twice', async () => {
  //   const values: Buffer[] = [];
  //   for (let i = 0; i < 64; ++i) {
  //     const v = Buffer.alloc(64, 0);
  //     v.writeUInt32LE(i, 0);
  //     values[i] = v;
  //   }

  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);
  //   await tree1.updateElements(0, values);

  //   // Create another tree
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);
  //   await tree2.updateElements(0, values);
  //   await tree2.updateElements(0, values);

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should allow inserting of larger subtree over smaller subtree', async () => {
  //   const treeSize = 65;
  //   const values: Buffer[] = [];
  //   for (let i = 0; i < treeSize; ++i) {
  //     const v = Buffer.alloc(64, 0);
  //     v.writeUInt32LE(i, 0);
  //     values[i] = v;
  //   }

  //   // Create reference tree.
  //   const db1 = levelup(memdown());
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);
  //   await tree1.updateElements(0, values);

  //   // Create another tree
  //   const db2 = levelup(memdown());
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   // insert partial values to another tree
  //   await tree2.updateElements(0, values.slice(0, treeSize - 7));

  //   // insert exsiting values plus new values to another tree
  //   await tree2.updateElements(0, values);

  //   await expectSameTrees(tree1, tree2);
  // });

  // it('should be able to restore from previous data', async () => {
  //   const levelDown = memdown();
  //   const db = levelup(levelDown);
  //   const tree = await MerkleTree.new(db, pedersen, 'test', 10);
  //   for (let i = 0; i < 4; ++i) {
  //     await tree.updateElement(i, values[i]);
  //   }

  //   const db2 = levelup(levelDown);
  //   const tree2 = await MerkleTree.fromName(db2, pedersen, 'test');

  //   expect(tree.getRoot()).toEqual(tree2.getRoot());
  //   for (let i = 0; i < 4; ++i) {
  //     expect(await tree.getHashPath(i)).toEqual(await tree2.getHashPath(i));
  //   }
  // });

  // it('should throw an error if previous data does not exist for the given name', async () => {
  //   const db = levelup(memdown());
  //   await expect(
  //     (async () => {
  //       await MerkleTree.fromName(db, pedersen, 'a_whole_new_tree');
  //     })(),
  //   ).rejects.toThrow();
  // });

  // it('should be able to sync the latest status from db', async () => {
  //   const levelDown = memdown();

  //   const db1 = levelup(levelDown);
  //   const tree1 = await MerkleTree.new(db1, pedersen, 'test', 10);

  //   const db2 = levelup(levelDown);
  //   const tree2 = await MerkleTree.new(db2, pedersen, 'test', 10);

  //   expect(tree1.getRoot()).toEqual(tree2.getRoot());
  //   expect(tree1.getSize()).toBe(0);
  //   expect(tree2.getSize()).toBe(0);

  //   for (let i = 0; i < 4; ++i) {
  //     await tree1.updateElement(i, values[i]);
  //   }

  //   const newRoot = tree1.getRoot();
  //   expect(tree1.getSize()).toBe(4);
  //   expect(tree2.getRoot()).not.toEqual(newRoot);
  //   expect(tree2.getSize()).toBe(0);

  //   await tree2.syncFromDb();

  //   expect(tree2.getRoot()).toEqual(newRoot);
  //   expect(tree2.getSize()).toBe(4);
  // });

  // it('should serialize hash path data to a buffer and be able to deserialize it back', async () => {
  //   const db = levelup(memdown());
  //   const tree = await MerkleTree.new(db, pedersen, 'test', 10);
  //   await tree.updateElement(0, values[0]);

  //   const hashPath = await tree.getHashPath(0);
  //   const buf = hashPath.toBuffer();
  //   const recovered = HashPath.fromBuffer(buf);
  //   expect(recovered).toEqual(hashPath);
  //   const deserialized = HashPath.deserialize(buf);
  //   expect(deserialized.elem).toEqual(hashPath);
  //   expect(deserialized.adv).toBe(4 + 10 * 64);

  //   const dummyData = Buffer.alloc(23, 1);
  //   const paddedBuf = Buffer.concat([dummyData, buf]);
  //   const recovered2 = HashPath.fromBuffer(paddedBuf, 23);
  //   expect(recovered2).toEqual(hashPath);
  //   const deserialized2 = HashPath.deserialize(buf);
  //   expect(deserialized2.elem).toEqual(hashPath);
  //   expect(deserialized2.adv).toBe(4 + 10 * 64);
  // });
});
