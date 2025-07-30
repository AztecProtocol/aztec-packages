import { pedersenHash, sha256Trunc } from '@aztec/foundation/crypto';

import type { AsyncHasher } from './hasher.js';
import { MerkleTree } from './merkle_tree.js';

/**
 * Merkle tree calculator.
 */
export class MerkleTreeCalculator {
  private constructor(
    private height: number,
    private zeroHashes: Buffer[],
    private hasher: AsyncHasher['hash'],
  ) {
    this.hasher = hasher;
  }

  static async create(
    height: number,
    zeroLeaf: Buffer = Buffer.alloc(32),
    hasher = async (left: Buffer, right: Buffer) =>
      (await pedersenHash([left, right])).toBuffer() as Buffer<ArrayBuffer>,
  ) {
    const zeroHashes = [zeroLeaf];
    for (let i = 0; i < height; i++) {
      zeroHashes.push((await hasher(zeroHashes[i], zeroHashes[i])) as Buffer<ArrayBuffer>);
    }
    return new MerkleTreeCalculator(height, zeroHashes, hasher);
  }

  async computeTree(leaves: Buffer[] = []): Promise<MerkleTree> {
    if (leaves.length === 0) {
      leaves = new Array(2 ** this.height).fill(this.zeroHashes[0]);
    }

    let result = leaves.slice();

    for (let i = 0; i < this.height; ++i) {
      const numLeaves = 2 ** (this.height - i);
      const newLeaves: Buffer[] = [];
      for (let j = 0; j < leaves.length / 2; ++j) {
        const l = leaves[j * 2];
        const r = leaves[j * 2 + 1] || this.zeroHashes[i];
        newLeaves[j] = await this.hasher(l, r);
      }
      result = result.concat(new Array(numLeaves - leaves.length).fill(this.zeroHashes[i]), newLeaves);
      leaves = newLeaves;
    }

    return new MerkleTree(this.height, result);
  }

  async computeTreeRoot(leaves: Buffer[] = []): Promise<Buffer> {
    if (leaves.length === 0) {
      return this.zeroHashes[this.zeroHashes.length - 1];
    }

    leaves = leaves.slice();

    for (let i = 0; i < this.height; ++i) {
      let j = 0;
      for (; j < leaves.length / 2; ++j) {
        const l = leaves[j * 2];
        const r = leaves[j * 2 + 1] || this.zeroHashes[i];
        leaves[j] = await this.hasher(l, r);
      }
      leaves = leaves.slice(0, j);
    }

    return leaves[0];
  }

  /**
   * Computes the Merkle root with the provided leaves **synchronously**.
   *
   * This method uses a synchronous hash function (defaults to `sha256Trunc`) and **does not** allow for padding.
   * If the number of leaves is not a power of two, it throws an error.
   * This contrasts with the above non-static async method `computeTreeRoot`, which can handle any number of leaves by
   * padding with zero hashes.
   */
  static computeTreeRootSync(leaves: Buffer[], hasher = sha256Trunc): Buffer {
    if (leaves.length === 0) {
      throw new Error('Cannot compute a Merkle root with no leaves');
    }

    const height = Math.log2(leaves.length);
    if (!Number.isInteger(height)) {
      throw new Error('Cannot compute a Merkle root with a non-power-of-two number of leaves');
    }

    let nodes = leaves.slice();

    for (let i = 0; i < height; ++i) {
      let j = 0;
      for (; j < nodes.length / 2; ++j) {
        const l = nodes[j * 2];
        const r = nodes[j * 2 + 1];
        nodes[j] = hasher(Buffer.concat([l, r]));
      }
      nodes = nodes.slice(0, j);
    }

    return nodes[0];
  }
}
