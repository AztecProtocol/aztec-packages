import { Fr } from '@aztec/foundation/fields';

import { MerkleTreeRootCalculator } from './merkle_tree_root_calculator.js';

describe('merkle tree root calculator', () => {
  it('should correctly handle no leaves', () => {
    // Height of 3 is 8 leaves.
    const calculator = new MerkleTreeRootCalculator(4);
    const expected = calculator.computeTreeRoot(new Array(8).fill(new Fr(0)).map(fr => fr.toBuffer()));
    expect(calculator.computeTreeRoot()).toEqual(expected);
  });

  it('should correctly leverage zero hashes', () => {
    const calculator = new MerkleTreeRootCalculator(4);
    const leaves = Array.from({ length: 4 }).map((_, i) => new Fr(i).toBuffer());
    const padded = [...leaves, ...new Array(4).fill(Buffer.alloc(32))];
    const expected = calculator.computeTreeRoot(padded);
    expect(calculator.computeTreeRoot(leaves)).toEqual(expected);
  });

  it('should correctly handle non default zero leaf', () => {
    const zeroLeaf = new Fr(666).toBuffer();
    const calculator = new MerkleTreeRootCalculator(4, zeroLeaf);
    const leaves = Array.from({ length: 4 }).map((_, i) => new Fr(i).toBuffer());
    const padded = [...leaves, ...new Array(4).fill(zeroLeaf)];
    const expected = calculator.computeTreeRoot(padded);
    expect(calculator.computeTreeRoot(leaves)).toEqual(expected);
  });
});
