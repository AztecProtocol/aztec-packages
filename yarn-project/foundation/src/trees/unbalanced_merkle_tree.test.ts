import { sha256Trunc } from '../crypto/index.js';
import { Fr } from '../fields/index.js';
import { MerkleTreeCalculator } from './merkle_tree_calculator.js';
import { computeUnbalancedMerkleTreeRoot, findLeafLevelAndIndex } from './unbalanced_merkle_tree.js';

describe('computeUnbalancedMerkleTreeRoot', () => {
  const hasher = (left: Buffer, right: Buffer) => sha256Trunc(Buffer.concat([left, right]));

  const createLeaves = (numLeaves: number, offset = 1) => {
    return Array.from({ length: numLeaves }, (_, i) => new Fr(i + offset).toBuffer());
  };

  const computeBalancedTreeRoot = (leaves: Buffer[]) => {
    return MerkleTreeCalculator.computeTreeRootSync(leaves);
  };

  it('1 leaf', () => {
    const leaves = createLeaves(1);
    const expectedRoot = leaves[0];
    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('2 leaves', () => {
    const leaves = createLeaves(2);
    const expectedRoot = hasher(leaves[0], leaves[1]);
    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('3 leaves', () => {
    // 3 = 11 = 2 + 1
    //
    //     root
    //     /  \
    //    .    3
    //  /  \
    // 1   2

    const leaves = createLeaves(3);

    const leftRoot = hasher(leaves[0], leaves[1]);
    const expectedRoot = hasher(leftRoot, leaves[2]);

    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('5 leaves', () => {
    // 5 = 101 = 4 + 1
    //
    //        root
    //        /  \
    //       .    5
    //     /   \
    //    .    .
    //  /  \  /  \
    // 1   2 3   4

    const leaves = createLeaves(5);

    const size4TreeRoot = computeBalancedTreeRoot(leaves.slice(0, 4));
    const expectedRoot = hasher(size4TreeRoot, leaves[4]);

    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('7 leaves', () => {
    // 7 = 111 = 4 + 2 + 1
    //
    //           root
    //        /        \
    //       .          .
    //     /   \       / \
    //    .    .      .  7
    //  /  \  /  \   / \
    // 1   2 3   4  5  6

    const leaves = createLeaves(7);

    const size2TreeRoot = computeBalancedTreeRoot(leaves.slice(4, 6));
    const rightBranchRoot = hasher(size2TreeRoot, leaves[6]);

    const size4TreeRoot = computeBalancedTreeRoot(leaves.slice(0, 4));
    const expectedRoot = hasher(size4TreeRoot, rightBranchRoot);

    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('10 leaves', () => {
    // 10 = 1010 = 8 + 2
    //
    //          root
    //        /     \
    //       .       .
    //     /  \     / \
    //   .    .    9  10
    //  /      \
    // 1  ...  8

    const leaves = createLeaves(10);

    const size2TreeRoot = computeBalancedTreeRoot(leaves.slice(8, 10));
    const size8TreeRoot = computeBalancedTreeRoot(leaves.slice(0, 8));
    const expectedRoot = hasher(size8TreeRoot, size2TreeRoot);

    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('31 leaves', () => {
    // 31 = 11111 = 16 + 8 + 4 + 2 + 1

    const leaves = createLeaves(31);

    const size2TreeRoot = computeBalancedTreeRoot(leaves.slice(28, 30));
    const subtreeRoot0 = hasher(size2TreeRoot, leaves[30]);

    const size4TreeRoot = computeBalancedTreeRoot(leaves.slice(24, 28));
    const subtreeRoot1 = hasher(size4TreeRoot, subtreeRoot0);

    const size8TreeRoot = computeBalancedTreeRoot(leaves.slice(16, 24));
    const subtreeRoot2 = hasher(size8TreeRoot, subtreeRoot1);

    const size16TreeRoot = computeBalancedTreeRoot(leaves.slice(0, 16));
    const expectedRoot = hasher(size16TreeRoot, subtreeRoot2);

    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });

  it('32 leaves', () => {
    const leaves = createLeaves(32);
    const expectedRoot = computeBalancedTreeRoot(leaves);
    expect(computeUnbalancedMerkleTreeRoot(leaves)).toEqual(expectedRoot);
  });
});

describe('findLeafLevelAndIndex', () => {
  it('findLeafLevelAndIndex', () => {
    expect(findLeafLevelAndIndex(1, 0)).toEqual({ level: 0, indexAtLevel: 0 });

    expect(findLeafLevelAndIndex(2, 0)).toEqual({ level: 1, indexAtLevel: 0 });
    expect(findLeafLevelAndIndex(2, 1)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(3, 0)).toEqual({ level: 2, indexAtLevel: 0 });
    expect(findLeafLevelAndIndex(3, 1)).toEqual({ level: 2, indexAtLevel: 1 });
    expect(findLeafLevelAndIndex(3, 2)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(4, 2)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(5, 2)).toEqual({ level: 3, indexAtLevel: 2 });
    expect(findLeafLevelAndIndex(5, 4)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(6, 4)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(7, 4)).toEqual({ level: 3, indexAtLevel: 4 });
    expect(findLeafLevelAndIndex(7, 6)).toEqual({ level: 2, indexAtLevel: 3 });

    expect(findLeafLevelAndIndex(8, 6)).toEqual({ level: 3, indexAtLevel: 6 });

    expect(findLeafLevelAndIndex(9, 6)).toEqual({ level: 4, indexAtLevel: 6 });
    expect(findLeafLevelAndIndex(9, 8)).toEqual({ level: 1, indexAtLevel: 1 });

    expect(findLeafLevelAndIndex(10, 8)).toEqual({ level: 2, indexAtLevel: 2 });

    expect(findLeafLevelAndIndex(11, 8)).toEqual({ level: 3, indexAtLevel: 4 });

    expect(findLeafLevelAndIndex(12, 8)).toEqual({ level: 3, indexAtLevel: 4 });

    expect(findLeafLevelAndIndex(13, 8)).toEqual({ level: 4, indexAtLevel: 8 });

    expect(findLeafLevelAndIndex(14, 8)).toEqual({ level: 4, indexAtLevel: 8 });
    expect(findLeafLevelAndIndex(14, 11)).toEqual({ level: 4, indexAtLevel: 11 });
    expect(findLeafLevelAndIndex(14, 12)).toEqual({ level: 3, indexAtLevel: 6 });
  });
});
