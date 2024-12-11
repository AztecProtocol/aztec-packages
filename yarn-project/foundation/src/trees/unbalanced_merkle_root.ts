import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';

/**
 * Computes the merkle root for an unbalanced tree.
 *
 * @dev Adapted from proving-state.ts -> findMergeLevel and unbalanced_tree.ts.
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
