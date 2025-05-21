import { Fr } from '@aztec/foundation/fields';

import { MerkleTreeCalculator } from './merkle_tree_calculator.js';

describe('merkle tree root calculator', () => {
  it('should correctly handle no leaves', async () => {
    // Height of 3 is 8 leaves.
    const calculator = await MerkleTreeCalculator.create(4);
    const expected = await calculator.computeTreeRoot(new Array(8).fill(new Fr(0)).map(fr => fr.toBuffer()));
    await expect(calculator.computeTreeRoot()).resolves.toEqual(expected);
  });

  it('should correctly leverage zero hashes', async () => {
    const calculator = await MerkleTreeCalculator.create(4);
    const leaves = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
    const padded = [...leaves, ...new Array(3).fill(Buffer.alloc(32))];
    const expected = await calculator.computeTreeRoot(padded);
    const result = await calculator.computeTreeRoot(leaves);
    expect(result).not.toBeUndefined();
    expect(result).toEqual(expected);
  });

  it('should correctly handle non default zero leaf', async () => {
    const zeroLeaf = new Fr(666).toBuffer() as Buffer<ArrayBuffer>;
    const calculator = await MerkleTreeCalculator.create(4, zeroLeaf);
    const leaves = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
    const padded = [...leaves, ...new Array(3).fill(zeroLeaf)];
    const expected = await calculator.computeTreeRoot(padded);
    await expect(calculator.computeTreeRoot(leaves)).resolves.toEqual(expected);
  });

  it('should compute entire tree', async () => {
    const calculator = await MerkleTreeCalculator.create(4);
    const leaves = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
    const expectedRoot = await calculator.computeTreeRoot(leaves);
    const result = await calculator.computeTree(leaves);
    expect(result.nodes.length).toEqual(31);
    expect(result.root).toEqual(expectedRoot);
  });

  it('should correctly handle empty leaf array', async () => {
    const calculator = await MerkleTreeCalculator.create(4);
    const expected = await calculator.computeTree();
    expect(expected.root).toEqual(await calculator.computeTreeRoot());
  });
});
