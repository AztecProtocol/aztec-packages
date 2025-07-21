import { pedersenHash } from '@aztec/foundation/crypto';

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
}
