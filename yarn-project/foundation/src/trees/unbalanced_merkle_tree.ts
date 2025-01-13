import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';

/**
 * Computes the merkle root for an unbalanced tree.
 *
 * @dev Adapted from unbalanced_tree.ts.
 * Calculates the tree upwards layer by layer until we reach the root.
 * The L1 calculation instead computes the tree from right to left (slightly cheaper gas).
 * TODO: A more thorough investigation of which method is cheaper, then use that method everywhere.
 */
export function computeUnbalancedMerkleRoot(leaves: Buffer[], emptyLeaf?: Buffer, hasher = sha256Trunc): Buffer {
  // Pad leaves to 2
  if (leaves.length < 2) {
    if (emptyLeaf === undefined) {
      throw new Error('Cannot compute a Merkle root with less than 2 leaves');
    } else {
      leaves = padArrayEnd(leaves, emptyLeaf, 2);
    }
  }

  const depth = Math.ceil(Math.log2(leaves.length));
  let [layerWidth, nodeToShift] =
    leaves.length & 1 ? [leaves.length - 1, leaves[leaves.length - 1]] : [leaves.length, Buffer.alloc(0)];
  // Allocate this layer's leaves and init the next layer up
  let thisLayer = leaves.slice(0, layerWidth);
  let nextLayer = [];
  for (let i = 0; i < depth; i++) {
    for (let j = 0; j < layerWidth; j += 2) {
      // Store the hash of each pair one layer up
      nextLayer[j / 2] = hasher(Buffer.concat([thisLayer[j], thisLayer[j + 1]]));
    }
    layerWidth /= 2;
    if (layerWidth & 1) {
      if (nodeToShift.length) {
        // If the next layer has odd length, and we have a node that needs to be shifted up, add it here
        nextLayer.push(nodeToShift);
        layerWidth += 1;
        nodeToShift = Buffer.alloc(0);
      } else {
        // If we don't have a node waiting to be shifted, store the next layer's final node to be shifted
        layerWidth -= 1;
        nodeToShift = nextLayer[layerWidth];
      }
    }
    // reset the layers
    thisLayer = nextLayer;
    nextLayer = [];
  }
  // return the root
  return thisLayer[0];
}

function getMaxBalancedTreeDepth(numLeaves: number) {
  return Math.floor(Math.log2(numLeaves));
}

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
