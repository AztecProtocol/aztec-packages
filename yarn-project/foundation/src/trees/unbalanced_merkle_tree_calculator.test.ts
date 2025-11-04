import { sha256Trunc } from '@aztec/foundation/crypto';
import { MerkleTreeCalculator, SiblingPath } from '@aztec/foundation/trees';

import { UnbalancedMerkleTreeCalculator } from './unbalanced_merkle_tree_calculator.js';

describe('UnbalancedMerkleTreeCalculator', () => {
  let tree: UnbalancedMerkleTreeCalculator;
  let leaves: Buffer[];

  const leaf = (leafValue: number) => {
    const buf = Buffer.alloc(32);
    buf.writeUInt32LE(leafValue, 0);
    return buf;
  };

  const expectSiblingPath = (leafValue: Buffer, expectedPath: Buffer[]) => {
    expect(tree.getSiblingPath(leafValue)).toEqual(new SiblingPath(expectedPath.length, expectedPath));
  };

  const expectSiblingPathToThrow = (leafIndex: number, message: string) => {
    expect(() => tree.getSiblingPathByLeafIndex(leafIndex)).toThrow(message);
  };

  const hasher = (left: Buffer, right: Buffer) => sha256Trunc(Buffer.concat([left, right]));

  const computeBalancedTreeRoot = (leaves: Buffer[]) => {
    return MerkleTreeCalculator.computeTreeRootSync(leaves);
  };

  const createBalancedTree = async (leaves: Buffer[]) => {
    const tree = await MerkleTreeCalculator.create(
      Math.log2(leaves.length),
      Buffer.alloc(32, 0),
      (lhs: Buffer, rhs: Buffer) => Promise.resolve(hasher(lhs, rhs) as Buffer<ArrayBuffer>),
    );
    return tree.computeTree(leaves);
  };

  describe('without compressed leaves', () => {
    // Fill the tree with leaves containing incrementing values from 1 to `numLeaves`.
    const createAndFillTree = (numLeaves: number) => {
      leaves = Array.from({ length: numLeaves }, (_, i) => leaf(i + 1));
      tree = UnbalancedMerkleTreeCalculator.create(leaves);
    };

    it('cannot initialize with no leaves', () => {
      expect(() => UnbalancedMerkleTreeCalculator.create([])).toThrow(
        'Cannot create a compressed unbalanced tree with 0 leaves.',
      );
    });

    it('1 leaf', () => {
      createAndFillTree(1);

      expect(tree.getRoot()).toEqual(leaf(1));

      expectSiblingPath(leaf(1), []);
    });

    it('2 leaves', () => {
      //  root
      //  /  \
      // 1   2
      createAndFillTree(2);

      const expectedRoot = hasher(leaf(1), leaf(2));
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(1), [leaf(2)]);
      expectSiblingPath(leaf(2), [leaf(1)]);
    });

    it('3 leaves', () => {
      //     root
      //     /  \
      //    .    3
      //  /  \
      // 1   2
      createAndFillTree(3);

      const root12 = hasher(leaf(1), leaf(2));
      const expectedRoot = hasher(root12, leaf(3));
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(1), [leaf(2), leaf(3)]);
      expectSiblingPath(leaf(2), [leaf(1), leaf(3)]);
      expectSiblingPath(leaf(3), [root12]);
    });

    it('5 leaves', () => {
      //       root
      //       /  \
      //      .    5
      //    /   \
      //   .    .
      //  / \  / \
      // 1  2  3 4
      createAndFillTree(5);

      const root12 = hasher(leaf(1), leaf(2));
      const root34 = hasher(leaf(3), leaf(4));
      const root1234 = hasher(root12, root34);
      const expectedRoot = hasher(root1234, leaf(5));
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(1), [leaf(2), root34, leaf(5)]);
      expectSiblingPath(leaf(4), [leaf(3), root12, leaf(5)]);
      expectSiblingPath(leaf(5), [root1234]);
    });

    it('7 leaves', () => {
      //           root
      //        /        \
      //       .          .
      //     /   \       / \
      //    .    .      .  7
      //  /  \  /  \   / \
      // 1   2 3   4  5  6
      createAndFillTree(7);

      const root12 = hasher(leaf(1), leaf(2));
      const root34 = hasher(leaf(3), leaf(4));
      const root56 = hasher(leaf(5), leaf(6));
      const root1234 = hasher(root12, root34);
      const root567 = hasher(root56, leaf(7));
      const expectedRoot = hasher(root1234, root567);
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(2), [leaf(1), root34, root567]);
      expectSiblingPath(leaf(5), [leaf(6), leaf(7), root1234]);
      expectSiblingPath(leaf(7), [root56, root1234]);
    });

    it('31 leaves', async () => {
      // 31 = subtrees of sizes 16, 8, 4, 2, 1
      //       root
      //    /       \
      // 1...16      .
      //           /   \
      //     17...24    .
      //             /   \
      //        25...28   .
      //                /   \
      //               .    31
      //             /   \
      //            29  30
      createAndFillTree(31);

      const leaves1to16 = leaves.slice(0, 16);
      const leaves17to24 = leaves.slice(16, 24);
      const leaves25to28 = leaves.slice(24, 28);
      const root1to16 = computeBalancedTreeRoot(leaves1to16);
      const root17to24 = computeBalancedTreeRoot(leaves17to24);
      const root25to28 = computeBalancedTreeRoot(leaves25to28);
      const root29to30 = hasher(leaf(29), leaf(30));
      const root29to31 = hasher(root29to30, leaf(31));
      const root25to31 = hasher(root25to28, root29to31);
      const root17to31 = hasher(root17to24, root25to31);
      const expectedRoot = hasher(root1to16, root17to31);
      expect(tree.getRoot()).toEqual(expectedRoot);

      const tree1to16 = await createBalancedTree(leaves1to16);
      const siblingPath14 = tree1to16.getSiblingPath(13 /* leafIndex */);
      expectSiblingPath(leaves1to16[13], siblingPath14.concat([root17to31]));

      const tree17to24 = await createBalancedTree(leaves17to24);
      const siblingPath24 = tree17to24.getSiblingPath(7 /* leafIndex */);
      expectSiblingPath(leaves17to24[7], siblingPath24.concat([root25to31, root1to16]));

      const tree25to28 = await createBalancedTree(leaves25to28);
      const siblingPath25 = tree25to28.getSiblingPath(0 /* leafIndex */);
      expectSiblingPath(leaves25to28[0], siblingPath25.concat([root29to31, root17to24, root1to16]));

      expectSiblingPath(leaf(31), [root29to30, root25to28, root17to24, root1to16]);
    });
  });

  describe('with compressed (zero) leaves', () => {
    const valueToCompress = leaf(0);

    // Fill the tree with leaves containing incrementing values from 1 to `numLeaves`.
    // If a value is not in `keptValues`, it is replaced with `valueToCompress`.
    const createAndFillTree = (numLeaves: number, keptValues = Array.from({ length: numLeaves }, (_, i) => i + 1)) => {
      leaves = Array.from({ length: numLeaves }, (_, i) =>
        keptValues.includes(i + 1) ? leaf(i + 1) : valueToCompress,
      );
      tree = UnbalancedMerkleTreeCalculator.create(leaves, valueToCompress);
    };

    it('with all zero leaves', () => {
      //        root     --->     0
      //        /  \
      //       .    0
      //     /   \
      //    .    .
      //  /  \  /  \
      // 0   0 0   0

      createAndFillTree(5, []);
      expect(tree.getRoot()).toEqual(Buffer.alloc(32));

      expectSiblingPathToThrow(0, 'Leaf at index 0 has been compressed.');
      expectSiblingPathToThrow(4, 'Leaf at index 4 has been compressed.');
    });

    it('with single zero leaf', () => {
      createAndFillTree(1, []);

      expect(tree.getRoot()).toEqual(Buffer.alloc(32));

      expectSiblingPathToThrow(0, 'Leaf at index 0 has been compressed.');
    });

    it('with zero leaves on the right branch', () => {
      //        root     --->       root
      //        /  \               /   \
      //       .    0             .     .
      //     /   \               / \   / \
      //    .    .              1  2  3  4
      //  /  \  /  \
      // 1   2 3   4

      createAndFillTree(5, [1, 2, 3, 4]);
      const size4TreeRoot = computeBalancedTreeRoot(leaves.slice(0, 4));
      expect(tree.getRoot()).toEqual(size4TreeRoot);

      const root12 = hasher(leaf(1), leaf(2));
      expectSiblingPath(leaf(3), [leaf(4), root12]);

      expectSiblingPathToThrow(4, 'Leaf at index 4 has been compressed.');
    });

    it('with zero leaves on the left branch', () => {
      //           root     --->      root
      //        /      \              /  \
      //       .        .            5   6
      //     /   \     / \
      //    .    .    5  6
      //  /  \  /  \
      // 0   0 0   0

      createAndFillTree(6, [5, 6]);
      expect(tree.getRoot()).toEqual(hasher(leaf(5), leaf(6)));

      expectSiblingPath(leaf(5), [leaf(6)]);
      expectSiblingPath(leaf(6), [leaf(5)]);

      expectSiblingPathToThrow(0, 'Leaf at index 0 has been compressed.');
      expectSiblingPathToThrow(1, 'Leaf at index 1 has been compressed.');
      expectSiblingPathToThrow(2, 'Leaf at index 2 has been compressed.');
      expectSiblingPathToThrow(3, 'Leaf at index 3 has been compressed.');
    });

    it('with zero leaves on both branches', () => {
      //           root       --->       root
      //        /        \              /   \
      //       .          .            .     6
      //     /   \       / \         / \
      //    .    .      .  0        2  3
      //  /  \  /  \   / \
      // 0   2 3   0  0  6

      createAndFillTree(7, [2, 3, 6]);

      const root23 = hasher(leaf(2), leaf(3));
      const expectedRoot = hasher(root23, leaf(6));
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(3), [leaf(2), leaf(6)]);

      expectSiblingPath(leaf(6), [root23]);
    });

    it('with single leaf after compression', () => {
      //           root     --->    3
      //        /      \
      //       .        .
      //     /   \     / \
      //    .    .    0  0
      //  /  \  /  \
      // 0   0 3   0

      createAndFillTree(6, [3]);
      expect(tree.getRoot()).toEqual(leaf(3));

      expectSiblingPath(leaf(3), []);

      expectSiblingPathToThrow(3, 'Leaf at index 3 has been compressed.');
      expectSiblingPathToThrow(4, 'Leaf at index 4 has been compressed.');
    });

    it('with larger right branch after compression', () => {
      //           root       --->       root
      //        /        \              /   \
      //       .          .            2     .
      //     /   \       / \                / \
      //    .    .      .  7               .  7
      //  /  \  /  \   / \               / \
      // 0   2 0   0  5  6              5  6

      createAndFillTree(7, [2, 5, 6, 7]);

      const root56 = hasher(leaf(5), leaf(6));
      const root567 = hasher(root56, leaf(7));
      const expectedRoot = hasher(leaf(2), root567);
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(2), [root567]);

      expectSiblingPath(leaf(5), [leaf(6), leaf(7), leaf(2)]);

      expectSiblingPath(leaf(7), [root56, leaf(2)]);

      expectSiblingPathToThrow(0, 'Leaf at index 0 has been compressed.');
      expectSiblingPathToThrow(3, 'Leaf at index 3 has been compressed.');
    });

    it('with large tree most zero leaves', () => {
      // 99 = subtrees of sizes 64, 32, 2, 1
      // Final tree:
      //      root
      //     /    \
      //    13     .
      //         /  \
      //        81  .
      //           / \
      //         98  99
      createAndFillTree(99, [13, 81, 98, 99]);

      const root9899 = hasher(leaf(98), leaf(99));
      const root819899 = hasher(leaf(81), root9899);
      const expectedRoot = hasher(leaf(13), root819899);
      expect(tree.getRoot()).toEqual(expectedRoot);

      expectSiblingPath(leaf(13), [root819899]);
      expectSiblingPath(leaf(81), [root9899, leaf(13)]);
      expectSiblingPath(leaf(98), [leaf(99), leaf(81), leaf(13)]);
      expectSiblingPath(leaf(99), [leaf(98), leaf(81), leaf(13)]);

      expectSiblingPathToThrow(10, 'Leaf at index 10 has been compressed.');
      expectSiblingPathToThrow(96, 'Leaf at index 96 has been compressed.');
    });
  });
});
