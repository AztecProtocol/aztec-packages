import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { MembershipWitness } from './membership_witness.js';
import { MerkleTree } from './merkle_tree.js';

/** A simple immutable indexed merkle tree container. Use a IndexedMerkleTreeCalculator to create a new instance from a set of leaves. */
export class IndexedMerkleTree<T extends IndexedTreeLeafPreimage, N extends number> extends MerkleTree {
  constructor(height: N, nodes: Buffer[], public readonly leafPreimages: T[]) {
    super(height, nodes);
  }

  public getLowLeaf(value: bigint): T {
    let lowLeaf: T | undefined;
    this.leafPreimages.forEach(leaf => {
      if (leaf.getKey() < value && (leaf.getNextKey() > value || leaf.getNextKey() == BigInt(0))) {
        lowLeaf = leaf;
      }
    });
    if (!lowLeaf) {
      throw new Error(`Couldn't find low leaf for ${value}`);
    }

    return lowLeaf;
  }

  public getMembershipWitness(leafIndexOrLeaf: number | Buffer): MembershipWitness<N> {
    const index = Buffer.isBuffer(leafIndexOrLeaf) ? this.getIndex(leafIndexOrLeaf) : leafIndexOrLeaf;
    const siblingPath = this.getSiblingPath(index);
    return new MembershipWitness<N>(
      this.height as N,
      BigInt(index),
      assertLength<Fr, N>(siblingPath.map(Fr.fromBuffer), this.height as N),
    );
  }
}
