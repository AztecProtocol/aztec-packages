import { sha256Trunc } from '../crypto/sha256/index.js';
import { MerkleTreeCalculator } from './merkle_tree_calculator.js';

/**
 * Computes the Merkle root of an unbalanced tree.
 *
 * Unlike a balanced Merkle tree, which requires the number of leaves to be a power of two, an unbalanced tree can have
 * any number of leaves.
 *
 * The tree is constructed by iteratively extracting the smallest power-of-two-sized subtrees from **right to left**.
 * For each such subtree, it computes the subtree root and then combines all subtree roots (again from right to left)
 * into a single root using the provided hash function.
 *
 * Note: We need the final tree to be as shallow as possible, to minimize the size of the sibling path required to prove
 * membership of a leaf. Therefor, the computation proceeds from right to left - smaller subtrees must always be
 * combined before being merged with a larger sibling on their left.
 *
 * For example, consider an unbalanced tree made of three subtrees of sizes 2, 4, and 8. If we combine the size-2 and
 * size-4 subtrees first (producing a subtree of depth 3), and then merge it with the size-8 subtree (also depth 3), the
 * resulting tree has a maximum depth of 4.
 *
 * But if we instead combine the size-4 and size-8 subtrees first (depth 4), and then merge with the size-2 subtree
 * (depth 1), the final tree has a depth of 5.
 */
export function computeUnbalancedMerkleTreeRoot(leaves: Buffer[], hasher = sha256Trunc): Buffer {
  if (!leaves.length) {
    throw new Error('Cannot compute a Merkle root with no leaves');
  }

  if (leaves.length === 1) {
    return leaves[0];
  }

  let numRemainingLeaves = leaves.length;
  let subtreeSize = 1;
  let root: Buffer | undefined;
  while (numRemainingLeaves > 1) {
    if ((numRemainingLeaves & subtreeSize) !== 0) {
      const subtreeLeaves = leaves.slice(numRemainingLeaves - subtreeSize, numRemainingLeaves);
      const subtreeRoot = MerkleTreeCalculator.computeTreeRootSync(subtreeLeaves, hasher);
      if (!root) {
        root = subtreeRoot;
      } else {
        root = hasher(Buffer.concat([subtreeRoot, root]));
      }

      numRemainingLeaves -= subtreeSize;
    }

    subtreeSize *= 2;
  }

  return root!;
}

/// Get the depth of the maximum balanced tree that can be created with the given number of leaves. The subtree will be
/// the left most subtree of the wonky tree with a total of `numLeaves` leaves.
///
/// Note: All the leaves may not be used to form the tree. For example, if there are 5 leaves, the maximum depth is 2,
/// only 4 leaves are used to form a balanced tree.
function getMaxBalancedSubtreeDepth(numLeaves: number) {
  return Math.floor(Math.log2(numLeaves));
}

/// Get the maximum depth of an unbalanced tree that can be created with the given number of leaves.
function getMaxUnbalancedTreeDepth(numLeaves: number) {
  return Math.ceil(Math.log2(numLeaves));
}

function findPosition(
  rootLevel: number,
  leafLevel: number,
  numLeaves: number,
  indexOffset: number,
  targetIndex: number,
): { level: number; indexAtLevel: number } {
  if (numLeaves <= 1) {
    // Single leaf.
    return { level: rootLevel, indexAtLevel: indexOffset };
  }

  // The largest balanced tree that can be created with the given number of leaves.
  const maxBalancedTreeDepth = getMaxBalancedSubtreeDepth(numLeaves);
  const numBalancedLeaves = 2 ** maxBalancedTreeDepth;
  const numRemainingLeaves = numLeaves - numBalancedLeaves;

  if (targetIndex < numBalancedLeaves) {
    // Target is in the balanced tree.

    // - If numRemainingLeaves is 0: this balanced tree is grown from the current root.
    // - If numRemainingLeaves is not 0: the remaining leaves will form another tree, which will become the right child of the root.
    //   And the balanced tree will be the left child of the root.
    //   There will be an extra level between the root of the balanced tree and the current root.
    const extraLevel = numRemainingLeaves ? 1 : 0;

    return { level: rootLevel + maxBalancedTreeDepth + extraLevel, indexAtLevel: indexOffset + targetIndex };
  } else {
    // Target is in the right branch.
    const rightBranchMaxLevel = getMaxUnbalancedTreeDepth(numRemainingLeaves);
    const shiftedUp = leafLevel - rootLevel - rightBranchMaxLevel - 1;
    const nextLeafLevel = leafLevel - shiftedUp;
    const newIndexOffset = (indexOffset + numBalancedLeaves) >> shiftedUp;
    const shiftedTargetIndex = targetIndex - numBalancedLeaves;
    return findPosition(rootLevel + 1, nextLeafLevel, numRemainingLeaves, newIndexOffset, shiftedTargetIndex);
  }
}

export function findLeafLevelAndIndex(numLeaves: number, leafIndex: number) {
  const maxLevel = getMaxUnbalancedTreeDepth(numLeaves);
  return findPosition(0, maxLevel, numLeaves, 0, leafIndex);
}
