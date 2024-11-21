import { pedersenHash } from '@aztec/foundation/crypto';

import { MerkleTree } from './merkle_tree.js';

/**
 * Merkle tree calculator.
 */
export class MerkleTreeCalculator {
  private zeroHashes: Promise<Buffer[]>;
  private hasher: (left: Buffer, right: Buffer) => Buffer | Promise<Buffer>;

  constructor(
    private height: number,
    zeroLeaf = Buffer.alloc(32),
    hasher: (left: Buffer, right: Buffer) => Buffer | Promise<Buffer> = async (left, right) =>
      (await pedersenHash([left, right])).toBuffer(),
  ) {
    this.hasher = hasher;
    this.zeroHashes = (async () => {
      const result = [zeroLeaf];
      for (let i = 0; i < height; i++) {
        result.push(await hasher(result[i], result[i]));
      }
      return result;
    })();
  }

  async computeTree(leaves: Buffer[] = []): Promise<MerkleTree> {
    if (leaves.length === 0) {
      const zeroHashes = await this.zeroHashes;
      // TODO(#4425): We should be returning a number of nodes that matches the tree height.
      return new MerkleTree(this.height, [zeroHashes[zeroHashes.length - 1]]);
    }

    let result = leaves.slice();

    const zeroHashes = await this.zeroHashes;
    for (let i = 0; i < this.height; ++i) {
      const numLeaves = 2 ** (this.height - i);
      const newLeaves: Buffer[] = [];
      for (let j = 0; j < leaves.length / 2; ++j) {
        const l = leaves[j * 2];
        const r = leaves[j * 2 + 1] || zeroHashes[i];
        newLeaves[j] = await this.hasher(l, r);
      }
      result = result.concat(new Array(numLeaves - leaves.length).fill(zeroHashes[i]), newLeaves);
      leaves = newLeaves;
    }

    return new MerkleTree(this.height, result);
  }

  async computeTreeRoot(leaves: Buffer[] = []): Promise<Buffer> {
    const zeroHashes = await this.zeroHashes;
    if (leaves.length === 0) {
      return zeroHashes[zeroHashes.length - 1];
    }

    leaves = leaves.slice();

    for (let i = 0; i < this.height; ++i) {
      let j = 0;
      for (; j < leaves.length / 2; ++j) {
        const l = leaves[j * 2];
        const r = leaves[j * 2 + 1] || zeroHashes[i];
        leaves[j] = await this.hasher(l, r);
      }
      leaves = leaves.slice(0, j);
    }

    return leaves[0];
  }
}
