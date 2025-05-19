import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { numToUInt32BE } from '@aztec/foundation/serialize';
import type { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import type { AsyncHasher } from './hasher.js';
import { IndexedMerkleTree } from './indexed_merkle_tree.js';

interface LeafPreimageFactory<T extends IndexedTreeLeafPreimage> {
  fromBuffer(buffer: Buffer): T;
}

/**
 * Indexed merkle tree calculator.
 */
export class IndexedMerkleTreeCalculator<T extends IndexedTreeLeafPreimage, N extends number> {
  private constructor(
    private height: N,
    private zeroHashes: Buffer[],
    private hasher: AsyncHasher,
    private factory: LeafPreimageFactory<T>,
  ) {}

  static async create<T extends IndexedTreeLeafPreimage, N extends number>(
    height: N,
    hasher: AsyncHasher,
    factory: LeafPreimageFactory<T>,
    zeroLeaf = Buffer.alloc(32),
  ) {
    const zeroHashes = [zeroLeaf];
    for (let i = 0; i < height; i++) {
      zeroHashes.push((await hasher.hash(zeroHashes[i], zeroHashes[i])) as Buffer<ArrayBuffer>);
    }
    return new IndexedMerkleTreeCalculator(height, zeroHashes, hasher, factory);
  }

  async computeTree(values: Buffer[]): Promise<IndexedMerkleTree<T, N>> {
    if (!values.find(v => toBigIntBE(v) == BigInt(0))) {
      // If we have no zero value, add one to form the zero leaf
      values = [Buffer.alloc(32), ...values];
    }
    const sorted = values
      .map((v, i) => ({ value: v, index: i }))
      .sort((a, b) => Number(toBigIntBE(b.value) - toBigIntBE(a.value)));
    const indexedLeaves = sorted.map((item, i) => ({
      leaf: this.factory.fromBuffer(
        Buffer.concat([
          item.value,
          ...(i == 0
            ? [Buffer.alloc(32), Buffer.alloc(32)]
            : [sorted[i - 1].value, numToUInt32BE(sorted[i - 1].index, 32)]),
        ]),
      ),
      index: item.index,
    }));
    const resortedIndexedLeaves = indexedLeaves.sort((a, b) => a.index - b.index).map(item => item.leaf);
    let leaves = await Promise.all(resortedIndexedLeaves.map(l => this.hasher.hashInputs(l.toHashInputs())));

    let result = leaves.slice();

    for (let i = 0; i < this.height; ++i) {
      const numLeaves = 2 ** (this.height - i);
      const newLeaves: Buffer<ArrayBuffer>[] = [];
      for (let j = 0; j < leaves.length / 2; ++j) {
        const l = leaves[j * 2];
        const r = leaves[j * 2 + 1] || this.zeroHashes[i];
        newLeaves[j] = await this.hasher.hash(l, r);
      }
      result = result.concat(new Array(numLeaves - leaves.length).fill(this.zeroHashes[i]), newLeaves);
      leaves = newLeaves;
    }

    return new IndexedMerkleTree(this.height, result, resortedIndexedLeaves);
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
        leaves[j] = await this.hasher.hash(l, r);
      }
      leaves = leaves.slice(0, j);
    }

    return leaves[0];
  }
}
