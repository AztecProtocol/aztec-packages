import { toBigIntBE } from '../bigint-buffer/index.js';
import { Tuple } from '../serialize/types.js';
import { Fr } from './fields.js';

/**
 * Class to wrap a single point coordinate
 */
export class Coordinate {
  static SIZE_IN_BYTES = 64;
  static ZERO = new Coordinate([Fr.ZERO, Fr.ZERO]);

  constructor(
    /**
     * The fields of the coordinate value. Least significant limb at index 0.
     */
    public fields: Tuple<Fr, 2>,
  ) {}

  /**
   * Converts the coordinate data into a tuple of fields
   * @returns A tuple of the coordinate fields
   */
  toFields(): Tuple<Fr, 2> {
    return this.fields;
  }

  /**
   * Generates a random coordinate value
   * @returns The random coordinate
   */
  static random(): Coordinate {
    return this.fromBuffer(Fr.random().toBuffer());
  }

  /**
   * Serialises the oblect to buffer of 2 fields.
   * @returns A buffer serialisation of the object.
   */
  toFieldsBuffer(): Buffer {
    return Buffer.concat([this.fields[0].toBuffer(), this.fields[1].toBuffer()]);
  }

  /**
   * Serialises the coordinate to a single 32 byte buffer.
   * @returns A buffer serialisation of the object.
   */
  toBuffer(): Buffer {
    const limb0 = this.fields[0].toBuffer();
    const limb1 = this.fields[1].toBuffer();
    limb0[0] = limb1[31];
    return limb0;
  }

  /**
   * Returns true if this coordinate is equal to the one provided
   * @param other - The coordinate against which to compare
   * @returns True if the coordinates are the same, false otherwise
   */
  equals(other: Coordinate): boolean {
    return this.toBigInt() === other.toBigInt();
  }

  /**
   * Returns the coordinate's value as a bigint
   * @returns The coordinate value as a bigint
   */
  toBigInt(): bigint {
    return toBigIntBE(this.toBuffer());
  }

  /**
   * Creates a coordinate object from a 32 byte coordinate value
   * @param coordinate - A buffer containing the 32 byte coordinate value
   * @returns The new coordinate object
   */
  static fromBuffer(coordinate: Buffer) {
    if (coordinate.length != 32) {
      throw new Error(`Invalid size of coordinate buffer`);
    }
    const limb0 = coordinate;
    const limb1 = Buffer.alloc(32);
    limb1[31] = limb0[0];
    limb0[0] = 0;
    return new Coordinate([Fr.fromBuffer(limb0), Fr.fromBuffer(limb1)]);
  }
}
