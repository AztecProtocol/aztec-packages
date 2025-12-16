import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { IndexedTreeLeaf, IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { z } from 'zod';

/**
 * Class containing the data of a preimage of a single leaf in the public data tree.
 * Note: It's called preimage because this data gets hashed before being inserted as a node into the `IndexedTree`.
 */
export class PublicDataTreeLeafPreimage implements IndexedTreeLeafPreimage {
  constructor(
    /**
     * The leaf (slot, value).
     */
    public leaf: PublicDataTreeLeaf,
    /**
     * Next key (slot) inside the indexed tree's linked list.
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
        leaf: PublicDataTreeLeaf.schema,
        nextKey: schemas.Fr,
        nextIndex: schemas.BigInt,
      })
      .transform(({ leaf, nextKey, nextIndex }) => new PublicDataTreeLeafPreimage(leaf, nextKey, nextIndex));
  }

  static get leafSchema() {
    return PublicDataTreeLeaf.schema;
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

  asLeaf(): PublicDataTreeLeaf {
    return this.leaf;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.toHashInputs());
  }

  toHashInputs(): Buffer[] {
    return [
      ...this.leaf.toHashInputs(),
      Buffer.from(toBufferBE(this.nextIndex, 32)),
      Buffer.from(this.nextKey.toBuffer()),
    ];
  }

  clone(): PublicDataTreeLeafPreimage {
    return new PublicDataTreeLeafPreimage(this.leaf.clone(), this.nextKey, this.nextIndex);
  }

  static random() {
    return new PublicDataTreeLeafPreimage(
      PublicDataTreeLeaf.buildDummy(BigInt(Math.floor(Math.random() * 1000))),
      Fr.random(),
      BigInt(Math.floor(Math.random() * 1000)),
    );
  }

  static empty(): PublicDataTreeLeafPreimage {
    return new PublicDataTreeLeafPreimage(PublicDataTreeLeaf.empty(), Fr.ZERO, 0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicDataTreeLeafPreimage {
    const reader = BufferReader.asReader(buffer);
    const value = PublicDataTreeLeaf.fromBuffer(reader);
    const nextIndex = toBigIntBE(reader.readBytes(32));
    const nextSlot = Fr.fromBuffer(reader);
    return new PublicDataTreeLeafPreimage(value, nextSlot, nextIndex);
  }

  static fromLeaf(leaf: PublicDataTreeLeaf, nextKey: bigint, nextIndex: bigint): PublicDataTreeLeafPreimage {
    return new PublicDataTreeLeafPreimage(leaf, new Fr(nextKey), nextIndex);
  }

  static clone(preimage: PublicDataTreeLeafPreimage): PublicDataTreeLeafPreimage {
    return preimage.clone();
  }
}

/**
 * A leaf in the public data indexed tree.
 */
export class PublicDataTreeLeaf implements IndexedTreeLeaf {
  constructor(
    /**
     * The slot the value is stored in
     */
    public slot: Fr,
    /**
     * The value stored in the slot
     */
    public value: Fr,
  ) {}

  getKey(): bigint {
    return this.slot.toBigInt();
  }

  toBuffer() {
    return serializeToBuffer([this.slot, this.value]);
  }

  clone(): PublicDataTreeLeaf {
    return new PublicDataTreeLeaf(this.slot, this.value);
  }

  toHashInputs(): Buffer[] {
    return [this.slot.toBuffer(), this.value.toBuffer()];
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataTreeLeaf(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  equals(another: PublicDataTreeLeaf): boolean {
    return this.slot.equals(another.slot) && this.value.equals(another.value);
  }

  toString(): string {
    return `PublicDataTreeLeaf(${this.slot.toString()}, ${this.value.toString()})`;
  }

  isEmpty(): boolean {
    return this.slot.isZero() && this.value.isZero();
  }

  updateTo(another: PublicDataTreeLeaf): PublicDataTreeLeaf {
    if (!this.slot.equals(another.slot)) {
      throw new Error('Invalid update: slots do not match');
    }
    return new PublicDataTreeLeaf(this.slot, another.value);
  }

  static buildDummy(key: bigint): PublicDataTreeLeaf {
    return new PublicDataTreeLeaf(new Fr(key), new Fr(0));
  }

  static empty(): PublicDataTreeLeaf {
    return new PublicDataTreeLeaf(Fr.ZERO, Fr.ZERO);
  }

  static get schema() {
    return z
      .object({
        slot: schemas.Fr,
        value: schemas.Fr,
      })
      .transform(({ slot, value }) => new PublicDataTreeLeaf(slot, value));
  }
}
