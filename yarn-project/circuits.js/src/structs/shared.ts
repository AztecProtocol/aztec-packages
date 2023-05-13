import { Fq } from '@aztec/foundation/fields';
import { Bufferable, serializeToBuffer } from '../utils/serialize.js';
import { BufferReader } from '@aztec/foundation/serialize';

/**
 * Implementation of a vector. Matches how we are serializing and deserializing vectors in cpp (length in the first position, followed by the items).
 */
export class Vector<T extends Bufferable> {
  constructor(
    /**
     * Items in the vector.
     */
    public items: T[],
  ) {}

  toBuffer() {
    return serializeToBuffer(this.items.length, this.items);
  }

  toFriendlyJSON() {
    return this.items;
  }
}

/**
 * Implementation of a uint8 vector.
 */
export class UInt8Vector {
  constructor(
    /**
     * Buffer containing the vector.
     */
    public buffer: Buffer,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.buffer.length, this.buffer);
  }

  static fromBuffer(buffer: Buffer | BufferReader): UInt8Vector {
    const reader = BufferReader.asReader(buffer);
    const size = reader.readNumber();
    const buf = reader.readBytes(size);
    return new UInt8Vector(buf);
  }
}

/**
 * A type alias for a 32-bit unsigned integer.
 */
export type UInt32 = number;

/* eslint-disable jsdoc/require-description-complete-sentence */

/**
 * Affine element of a group, composed of two elements in Fq.
 * cpp/barretenberg/cpp/src/aztec/ecc/groups/affine_element.hpp
 * cpp/barretenberg/cpp/src/aztec/ecc/curves/bn254/g1.hpp
 */
export class AffineElement {
  /**
   * Element's x coordinate.
   */
  public x: Fq;
  /**
   * Element's y coordinate.
   */
  public y: Fq;

  constructor(x: Fq | bigint, y: Fq | bigint) {
    this.x = typeof x === 'bigint' ? new Fq(x) : x;
    this.y = typeof y === 'bigint' ? new Fq(y) : y;
  }

  toBuffer() {
    return serializeToBuffer(this.x, this.y);
  }

  static fromBuffer(buffer: Buffer | BufferReader): AffineElement {
    const reader = BufferReader.asReader(buffer);
    return new AffineElement(reader.readFq(), reader.readFq());
  }

  toFriendlyJSON() {
    return `(${this.x.toString()}, ${this.y.toString()})`;
  }
}

/**
 * Composer prover type.
 */
export enum ComposerType {
  STANDARD = 0,
  TURBO = 1,
  PLOOKUP = 2,
  STANDARD_HONK = 3,
}

/**
 * Rollup types.
 */
export enum RollupTypes {
  Base = 0,
  Merge = 1,
  Root = 2,
}
