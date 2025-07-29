import { sha256Trunc } from '../crypto/sha256/index.js';
import { MerkleTreeCalculator } from './merkle_tree_calculator.js';

/**
 * Computes the merkle root for an unbalanced tree.
 */
export function computeUnbalancedMerkleTreeRoot(
  leaves: Buffer[],
  zeroLeaf = Buffer.alloc(32),
  hasher = sha256Trunc,
): Buffer {
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
      const subtreeRoot = MerkleTreeCalculator.computeTreeRootSync(subtreeLeaves, undefined, zeroLeaf, hasher);
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

/// Get the maximum depth of a balanced tree that can be created with the given number of leaves.
///
/// Note: All the leaves may not be used to form the tree. For example, if there are 5 leaves, the maximum depth is 2,
/// only 4 leaves are used to form a balanced tree.
function getMaxBalancedTreeDepth(numLeaves: number) {
  return Math.floor(Math.log2(numLeaves));
}

/// Get the maximum depth of an unbalanced tree that can be created with the given number of leaves.
export function getMaxUnbalancedTreeDepth(numLeaves: number) {
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
  const maxBalancedTreeDepth = getMaxBalancedTreeDepth(numLeaves);
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
