import { poseidonMerkleHash, shaMerkleHash } from './hasher.js';

export const computeBalancedShaRoot = (leaves: Buffer[]) => computeBalancedMerkleTreeRoot(leaves);

export const computeBalancedPoseidonRoot = async (leaves: Buffer[]) =>
  await computeBalancedMerkleTreeRootAsync(leaves, poseidonMerkleHash);

/**
 * Computes the Merkle root with the provided leaves **synchronously**.
 * This method uses a synchronous hash function (defaults to `sha256Trunc`).
 *
 * @throws If the number of leaves is not a power of two.
 */
export function computeBalancedMerkleTreeRoot(leaves: Buffer[], hasher = shaMerkleHash): Buffer {
  const height = getTreeHeight(leaves);
  let nodes = leaves.slice();

  for (let i = 0; i < height; ++i) {
    let j = 0;
    for (; j < nodes.length / 2; ++j) {
      const l = nodes[j * 2];
      const r = nodes[j * 2 + 1];
      nodes[j] = hasher(l, r);
    }
    nodes = nodes.slice(0, j);
  }

  return nodes[0];
}

/**
 * Computes the Merkle root with the provided leaves **asynchronously**.
 * This method uses an asynchronous hash function (defaults to `poseidon2Hash`).
 *
 * @throws If the number of leaves is not a power of two.
 */
export async function computeBalancedMerkleTreeRootAsync(
  leaves: Buffer[],
  hasher = poseidonMerkleHash,
): Promise<Buffer> {
  const height = getTreeHeight(leaves);
  let nodes = leaves.slice();

  for (let i = 0; i < height; ++i) {
    let j = 0;
    for (; j < nodes.length / 2; ++j) {
      const l = nodes[j * 2];
      const r = nodes[j * 2 + 1];
      nodes[j] = await hasher(l, r);
    }
    nodes = nodes.slice(0, j);
  }

  return nodes[0];
}

function getTreeHeight(leaves: Buffer[]) {
  if (leaves.length === 0) {
    throw new Error('Cannot compute a Merkle root with no leaves');
  }

  const height = Math.log2(leaves.length);
  if (!Number.isInteger(height)) {
    throw new Error('Cannot compute a Merkle root with a non-power-of-two number of leaves');
  }

  return height;
}
