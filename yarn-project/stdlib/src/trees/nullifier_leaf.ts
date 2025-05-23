import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';
import type { IndexedTreeLeaf, IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { z } from 'zod';

/**
 * Class containing the data of a preimage of a single leaf in the nullifier tree.
 * Note: It's called preimage because this data gets hashed before being inserted as a node into the `IndexedTree`.
 */
export class NullifierLeafPreimage implements IndexedTreeLeafPreimage {
  constructor(
    /**
     * Leaf value inside the indexed tree's linked list.
     */
    public leaf: NullifierLeaf,
    /**
     * Next nullifier inside the indexed tree's linked list.
     */
    public nextKey: Fr,
    /**
     * Index of the next leaf in the indexed tree's linked list.
     */
    public nextIndex: bigint,
  ) {}

  static get schema() {
    return z
      .object({
        leaf: NullifierLeaf.schema,
        nextKey: schemas.Fr,
        nextIndex: schemas.BigInt,
      })
      .transform(({ leaf, nextKey, nextIndex }) => new NullifierLeafPreimage(leaf, nextKey, nextIndex));
  }

  static get leafSchema() {
    return NullifierLeaf.schema;
  }

  getKey(): bigint {
    return this.leaf.getKey();
  }

  getNextKey(): bigint {
    return this.nextKey.toBigInt();
  }

  getNextIndex(): bigint {
    return this.nextIndex;
  }

  asLeaf(): NullifierLeaf {
    return this.leaf;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.toHashInputs());
  }

  toHashInputs(): Buffer[] {
    return [
      ...this.leaf.toHashInputs(),
      Buffer.from(this.nextKey.toBuffer()),
      Buffer.from(toBufferBE(this.nextIndex, 32)),
    ];
  }

  toFields(): Fr[] {
    return this.toHashInputs().map(buf => Fr.fromBuffer(buf));
  }

  clone(): NullifierLeafPreimage {
    return new NullifierLeafPreimage(this.leaf.clone(), this.nextKey, this.nextIndex);
  }

  static random() {
    return new NullifierLeafPreimage(NullifierLeaf.random(), Fr.random(), BigInt(Math.floor(Math.random() * 1000)));
  }

  static empty(): NullifierLeafPreimage {
    return new NullifierLeafPreimage(NullifierLeaf.empty(), Fr.zero(), 0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader): NullifierLeafPreimage {
    const reader = BufferReader.asReader(buffer);
    return new NullifierLeafPreimage(
      NullifierLeaf.fromBuffer(reader),
      reader.readObject(Fr),
      toBigIntBE(reader.readBytes(32)),
    );
  }

  static fromLeaf(leaf: NullifierLeaf, nextKey: bigint, nextIndex: bigint): NullifierLeafPreimage {
    return new NullifierLeafPreimage(leaf, new Fr(nextKey), nextIndex);
  }

  static clone(preimage: NullifierLeafPreimage): NullifierLeafPreimage {
    return preimage.clone();
  }
}

/**
 * A nullifier to be inserted in the nullifier tree.
 */
export class NullifierLeaf implements IndexedTreeLeaf {
  constructor(
    /**
     * Nullifier value.
     */
    public nullifier: Fr,
  ) {}

  getKey(): bigint {
    return this.nullifier.toBigInt();
  }

  toBuffer(): Buffer {
    return this.nullifier.toBuffer();
  }

  clone(): NullifierLeaf {
    return new NullifierLeaf(new Fr(this.nullifier));
  }

  toHashInputs(): Buffer[] {
    return [Buffer.from(this.nullifier.toBuffer())];
  }

  static empty(): NullifierLeaf {
    return new NullifierLeaf(Fr.ZERO);
  }

  static random(): NullifierLeaf {
    return new NullifierLeaf(Fr.random());
  }

  isEmpty(): boolean {
    return this.nullifier.isZero();
  }

  updateTo(_another: NullifierLeaf): NullifierLeaf {
    throw new Error('Nullifiers are create only');
  }

  static buildDummy(key: bigint): NullifierLeaf {
    return new NullifierLeaf(new Fr(key));
  }

  static fromBuffer(buf: Buffer | BufferReader): NullifierLeaf {
    const reader = BufferReader.asReader(buf);
    return new NullifierLeaf(reader.readObject(Fr));
  }

  static get schema() {
    return z.object({ nullifier: schemas.Fr }).transform(({ nullifier }) => new NullifierLeaf(nullifier));
  }
}
