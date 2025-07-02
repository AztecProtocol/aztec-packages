import { serializeToBuffer } from '@aztec/foundation/serialize';
import type { AsyncHasher } from '@aztec/foundation/trees';
import { SiblingPath } from '@aztec/foundation/trees';

import { pedersenHash } from '../crypto/pedersen/index.js';

const indexToKeyHash = (level: number, index: bigint) => `${level}:${index}`;

/**
 * An ephemeral unbalanced Merkle tree implementation.
 * Follows the rollup implementation which greedily hashes pairs of nodes up the tree.
 * Remaining rightmost nodes are shifted up until they can be paired.
 */
export class UnbalancedMerkleTreeCalculator {
  // This map stores index and depth -> value
  private cache: { [key: string]: Buffer } = {};
  // This map stores value -> index and depth, since we have variable depth
  private valueCache: { [key: string]: string } = {};
  protected size: bigint = 0n;

  root: Buffer = Buffer.alloc(32);

  public constructor(
    private maxDepth: number,
    private hasher: AsyncHasher['hash'],
  ) {}

  static create(
    height: number,
    hasher = async (left: Buffer, right: Buffer) =>
      (await pedersenHash([left, right])).toBuffer() as Buffer<ArrayBuffer>,
  ) {
    return new UnbalancedMerkleTreeCalculator(height, hasher);
  }

  /**
   * Returns the root of the tree.
   * @returns The root of the tree.
   */
  public getRoot(): Buffer {
    return this.root;
  }

  /**
   * Returns a sibling path for the element at the given index.
   * @param value - The value of the element.
   * @returns A sibling path for the element.
   * Note: The sibling path is an array of sibling hashes, with the lowest hash (leaf hash) first, and the highest hash last.
   */
  public getSiblingPath<N extends number>(value: bigint): Promise<SiblingPath<N>> {
    const path: Buffer[] = [];
    const [depth, _index] = this.valueCache[serializeToBuffer(value).toString('hex')].split(':');
    let level = parseInt(depth, 10);
    let index = BigInt(_index);
    while (level > 0) {
      const isRight = index & 0x01n;
      const key = indexToKeyHash(level, isRight ? index - 1n : index + 1n);
      const sibling = this.cache[key];
      path.push(sibling);
      level -= 1;
      index >>= 1n;
    }
    return Promise.resolve(new SiblingPath<N>(parseInt(depth, 10) as N, path));
  }

  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(leaves: Buffer[]): Promise<void> {
    if (this.size != BigInt(0)) {
      throw Error(`Can't re-append to an unbalanced tree. Current has ${this.size} leaves.`);
    }
    const root = await this.batchInsert(leaves);
    this.root = root;

    return Promise.resolve();
  }

  /**
   * Calculates root while adding leaves and nodes to the cache.
   * @param leaves - The leaves to append.
   * @returns Resulting root of the tree.
   */
  private async batchInsert(_leaves: Buffer[]): Promise<Buffer> {
    // If we have an even number of leaves, hash them all in pairs
    // Otherwise, store the final leaf to be shifted up to the next odd sized level
    let [layerWidth, nodeToShift] =
      _leaves.length & 1
        ? [_leaves.length - 1, serializeToBuffer(_leaves[_leaves.length - 1])]
        : [_leaves.length, Buffer.alloc(0)];
    // Allocate this layer's leaves and init the next layer up
    let thisLayer = _leaves.slice(0, layerWidth).map(l => serializeToBuffer(l));
    let nextLayer = [];
    // Store the bottom level leaves
    thisLayer.forEach((leaf, i) => this.storeNode(leaf, this.maxDepth, BigInt(i)));
    for (let i = 0; i < this.maxDepth; i++) {
      for (let j = 0; j < layerWidth; j += 2) {
        // Store the hash of each pair one layer up
        nextLayer[j / 2] = await this.hasher(serializeToBuffer(thisLayer[j]), serializeToBuffer(thisLayer[j + 1]));
        this.storeNode(nextLayer[j / 2], this.maxDepth - i - 1, BigInt(j >> 1));
      }
      layerWidth /= 2;
      if (layerWidth & 1) {
        if (nodeToShift.length) {
          // If the next layer has odd length, and we have a node that needs to be shifted up, add it here
          nextLayer.push(serializeToBuffer(nodeToShift));
          this.storeNode(nodeToShift, this.maxDepth - i - 1, BigInt((layerWidth * 2) >> 1));
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
    this.size += BigInt(_leaves.length);
    // return the root
    return thisLayer[0];
  }

  private storeNode(value: Buffer, depth: number, index: bigint) {
    const key = indexToKeyHash(depth, index);
    this.cache[key] = value;
    this.valueCache[value.toString('hex')] = key;
  }
}
