import { computeBalancedMerkleTreeRoot, computeBalancedMerkleTreeRootAsync } from './balanced_merkle_tree_root.js';
import { poseidonMerkleHash, shaMerkleHash } from './hasher.js';
import { UnbalancedMerkleTreeCalculator } from './unbalanced_merkle_tree_calculator.js';

export const computeUnbalancedShaRoot = (leaves: Buffer[]) => computeUnbalancedMerkleTreeRoot(leaves, shaMerkleHash);

export const computeUnbalancedPoseidonRoot = async (leaves: Buffer[]) =>
  await computeUnbalancedMerkleTreeRootAsync(leaves, poseidonMerkleHash);

export const computeWonkyShaRoot = (leaves: Buffer[]) => computeWonkyMerkleTreeRoot(leaves);

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
export function computeUnbalancedMerkleTreeRoot(
  leaves: Buffer[],
  hasher = shaMerkleHash,
  emptyRoot = Buffer.alloc(32),
): Buffer {
  if (!leaves.length) {
    return emptyRoot;
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
      const subtreeRoot = computeBalancedMerkleTreeRoot(subtreeLeaves, hasher);
      if (!root) {
        root = subtreeRoot;
      } else {
        root = hasher(subtreeRoot, root);
      }

      numRemainingLeaves -= subtreeSize;
    }

    subtreeSize *= 2;
  }

  return root!;
}

export async function computeUnbalancedMerkleTreeRootAsync(
  leaves: Buffer[],
  hasher = poseidonMerkleHash,
  emptyRoot = Buffer.alloc(32),
): Promise<Buffer> {
  if (!leaves.length) {
    return emptyRoot;
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
      const subtreeRoot = await computeBalancedMerkleTreeRootAsync(subtreeLeaves, hasher);
      if (!root) {
        root = subtreeRoot;
      } else {
        root = await hasher(subtreeRoot, root);
      }

      numRemainingLeaves -= subtreeSize;
    }

    subtreeSize *= 2;
  }

  return root!;
}

// A **wonky** tree is a "compressed" unbalanced Merkle tree.
// It is constructed in the same way as an unbalanced tree: by first creating the largest possible left subtree, with
// the remaining leaves forming a right subtree that follows the same process recursively.
// During construction, leaves equal to `valueToCompress` are skipped (compressed) and do not contribute to the tree.
export function computeWonkyMerkleTreeRoot(
  leaves: Buffer[],
  valueToCompress = Buffer.alloc(32),
  emptyRoot = Buffer.alloc(32),
  hasher = shaMerkleHash,
): Buffer {
  const calculator = UnbalancedMerkleTreeCalculator.create(leaves, valueToCompress, emptyRoot, hasher);
  return calculator.getRoot();
}
