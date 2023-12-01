import { Fr, NULLIFIER_TREE_HEIGHT } from '@aztec/circuits.js';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';

import { SiblingPath } from '../sibling_path.js';
import { IndexedTreeLeaf, IndexedTreeLeafPreimage, LeafData } from './indexed_tree.js';

/**
 * Nullifier membership witness.
 * @remarks When this represents membership witness of a low nullifier it can be used to perform a nullifier
 * non-inclusion proof by leveraging the "linked list structure" of leaves and proving that a lower nullifier
 * is pointing to a bigger next value than the nullifier we are trying to prove non-inclusion for.
 */
export class NullifierMembershipWitness {
  constructor(
    /**
     * The index of the nullifier in a tree.
     */
    public readonly index: bigint,
    /**
     * Preimage of the nullifier.
     */
    public readonly leafData: LeafData,
    /**
     * Sibling path to prove membership of the nullifier.
     */
    public readonly siblingPath: SiblingPath<typeof NULLIFIER_TREE_HEIGHT>,
  ) {}

  /**
   * Returns a field array representation of a nullifier witness.
   * @returns A field array representation of a nullifier witness.
   */
  public toFieldArray(): Fr[] {
    return [
      new Fr(this.index),
      new Fr(this.leafData.value),
      new Fr(this.leafData.nextIndex),
      new Fr(this.leafData.nextValue),
      ...this.siblingPath.toFieldArray(),
    ];
  }
}

/* eslint-disable */

export class NullifierLeafPreimage implements IndexedTreeLeafPreimage<NullifierLeaf> {
  constructor(public key: bigint, public nextKey: bigint, public nextIndex: bigint) {}

  asLeaf(): NullifierLeaf {
    return new NullifierLeaf(new Fr(this.key));
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.toHashInputs());
  }

  toHashInputs(): Buffer[] {
    return [
      Buffer.from(toBufferBE(this.key, 32)),
      Buffer.from(toBufferBE(this.nextIndex, 32)),
      Buffer.from(toBufferBE(this.nextKey, 32)),
    ];
  }

  clone(): NullifierLeafPreimage {
    return new NullifierLeafPreimage(this.key, this.nextKey, this.nextIndex);
  }

  static empty(): NullifierLeafPreimage {
    return new NullifierLeafPreimage(0n, 0n, 0n);
  }

  static fromBuffer(buf: Buffer): NullifierLeafPreimage {
    const key = toBigIntBE(buf.subarray(0, 32));
    const nextKey = toBigIntBE(buf.subarray(32, 64));
    const nextIndex = toBigIntBE(buf.subarray(64, 96));
    return new NullifierLeafPreimage(key, nextKey, nextIndex);
  }

  static fromLeaf(leaf: NullifierLeaf, nextKey: bigint, nextIndex: bigint): NullifierLeafPreimage {
    return new NullifierLeafPreimage(leaf.nullifier.toBigInt(), nextKey, nextIndex);
  }
}

export class NullifierLeaf implements IndexedTreeLeaf {
  constructor(public nullifier: Fr) {}

  getKey(): bigint {
    return this.nullifier.toBigInt();
  }

  toBuffer(): Buffer {
    return this.nullifier.toBuffer();
  }

  isEmpty(): boolean {
    return this.nullifier.isZero();
  }

  static buildDummy(key: bigint): NullifierLeaf {
    return new NullifierLeaf(new Fr(key));
  }

  static fromBuffer(buf: Buffer): NullifierLeaf {
    return new NullifierLeaf(Fr.fromBuffer(buf));
  }
}
