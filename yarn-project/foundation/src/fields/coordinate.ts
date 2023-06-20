import { BufferReader } from '../serialize/buffer_reader.js';
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
     * The limbs of the corrdinate value. Least significant limb at index 0.
     */
    public limbs: Tuple<Fr, 2>,
  ) {}

  /**
   * Converts the coordinate data into a tuple of fields
   * @returns A tuple of the coordinate fields
   */
  toFields(): Tuple<Fr, 2> {
    return this.limbs;
  }

  /**
   * Generates a random coordinate value
   * @returns The random coordinate
   */
  static random(): Coordinate {
    return new Coordinate([Fr.random(), Fr.random()]);
  }

  /**
   * Serialises the oblect to buffer.
   * @returns A buffer serialisation of the object.
   */
  toBuffer(): Buffer {
    return Buffer.concat([this.limbs[0].toBuffer(), this.limbs[1].toBuffer()]);
  }

  /**
   * Deserialises a Coordinate object from a buffer
   * @param data - The buffer from which to deserialise the object.
   * @returns The deserialised object.
   */
  static fromBuffer(data: Buffer | BufferReader): Coordinate {
    const reader = BufferReader.asReader(data);
    return new Coordinate([reader.readFr(), reader.readFr()]);
  }

  /**
   * Returns true if this coordinate is equal to the one provided
   * @param other - The coordinate against which to compare
   * @returns True if the coordinates are the same, false otherwise
   */
  equals(other: Coordinate): boolean {
    return this.limbs[0] == other.limbs[0] && this.limbs[1] == other.limbs[1];
  }
}
