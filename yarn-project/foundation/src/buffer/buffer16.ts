import { randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, deserializeBigInt, serializeBigInt } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { bufferToHex } from '../string/index.js';

/**
 * A class representing a fixed-size 16-byte buffer.
 *
 * This class provides a type-safe wrapper around 16-byte buffers (128 bits),
 * commonly used for representing identifiers, smaller hashes, and other 128-bit values
 * in the Aztec protocol. Buffer16 enforces the 16-byte constraint at construction time
 * and provides convenient methods for serialization, comparison, and conversion.
 *
 * @example
 * ```typescript
 * // Create from hex string
 * const id = Buffer16.fromString("0x1234567890abcdef1234567890abcdef");
 *
 * // Create random
 * const random = Buffer16.random();
 *
 * // Create from number
 * const num = Buffer16.fromNumber(12345);
 *
 * // Compare
 * if (id.equals(other)) {
 *   // IDs are equal
 * }
 *
 * // Check if zero
 * if (id.isZero()) {
 *   // ID is all zeros
 * }
 *
 * // Convert to BigInt
 * const value = id.toBigInt();
 * ```
 *
 * @remarks
 * - All buffers are exactly 16 bytes (128 bits)
 * - Attempting to create a Buffer16 with wrong size throws an error
 * - Immutable: methods return new instances rather than modifying existing ones
 * - Commonly used for 128-bit identifiers, UUIDs, and smaller cryptographic values
 * - Serializable to/from JSON, Buffer, BigInt, and hex strings
 * - Smaller memory footprint than Buffer32 for cases where 128 bits are sufficient
 */
export class Buffer16 {
  /**
   * The size of the hash in bytes.
   */
  public static SIZE = 16;

  /**
   * Buffer16 with value zero.
   */
  public static ZERO = new Buffer16(Buffer.alloc(Buffer16.SIZE));

  constructor(
    /**
     * The buffer containing the hash.
     */
    public buffer: Buffer,
  ) {
    if (buffer.length !== Buffer16.SIZE) {
      throw new Error(`Expected buffer to have length ${Buffer16.SIZE} but was ${buffer.length}`);
    }
  }

  /**
   * Returns the raw buffer of the hash.
   * @returns The buffer containing the hash.
   */
  public toBuffer() {
    return this.buffer;
  }

  /**
   * Creates a Buffer16 from a buffer.
   * @param buffer - The buffer to create from.
   * @returns A new Buffer16 object.
   */
  public static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Buffer16(reader.readBytes(Buffer16.SIZE));
  }

  /**
   * Checks if this hash and another hash are equal.
   * @param hash - A hash to compare with.
   * @returns True if the hashes are equal, false otherwise.
   */
  public equals(hash: Buffer16): boolean {
    return this.buffer.equals(hash.buffer);
  }

  /**
   * Returns true if this hash is zero.
   * @returns True if this hash is zero.
   */
  public isZero(): boolean {
    return this.buffer.equals(Buffer.alloc(16, 0));
  }

  /**
   * Convert this hash to a hex string.
   * @returns The hex string.
   */
  public toString() {
    return bufferToHex(this.buffer);
  }

  [inspect.custom]() {
    return `Buffer16<${this.toString()}>`;
  }

  toJSON() {
    return this.toString();
  }

  /**
   * Convert this hash to a big int.
   * @returns The big int.
   */
  public toBigInt() {
    return deserializeBigInt(this.buffer, 0, Buffer16.SIZE).elem;
  }

  /**
   * Creates a Buffer16 from a bigint.
   */
  public static fromBigInt(hash: bigint) {
    return new Buffer16(serializeBigInt(hash, Buffer16.SIZE));
  }

  public static fromField(hash: Fr) {
    return new Buffer16(serializeBigInt(hash.toBigInt()));
  }

  /**
   * Converts a hex string into a Buffer16 object.
   */
  public static fromString(str: string): Buffer16 {
    if (str.startsWith('0x')) {
      str = str.slice(2);
    }
    if (str.length !== this.SIZE * 2) {
      throw new Error(`Expected string to be ${this.SIZE * 2} characters long, but was ${str.length}`);
    }
    return new Buffer16(Buffer.from(str, 'hex'));
  }

  /**
   * Converts a number into a Buffer16 object.
   * @param num - The number to convert.
   * @returns A new Buffer16 object.
   */
  public static fromNumber(num: number): Buffer16 {
    return new Buffer16(serializeBigInt(BigInt(num), Buffer16.SIZE));
  }

  /**
   * Generates a random Buffer16.
   * @returns A new Buffer16 object.
   */
  public static random(): Buffer16 {
    return new Buffer16(Buffer.from(randomBytes(Buffer16.SIZE)));
  }
}
