import { randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, deserializeBigInt, serializeBigInt } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { bufferToHex } from '../string/index.js';

/**
 * A class representing a fixed-size 32-byte buffer.
 *
 * This is a commonly used data structure throughout the Aztec protocol for representing
 * fixed-size data such as hashes, field elements, and other cryptographic primitives.
 * Buffer32 enforces the 32-byte constraint at construction time and provides convenient
 * methods for serialization, comparison, and conversion.
 *
 * @example
 * ```typescript
 * // Create from hex string
 * const hash = Buffer32.fromString("0x1234..."); // 64 hex chars
 *
 * // Create random
 * const random = Buffer32.random();
 *
 * // Create from number
 * const num = Buffer32.fromNumber(12345);
 *
 * // Compare
 * if (hash.equals(other)) {
 *   // hashes are equal
 * }
 *
 * // Check if zero
 * if (hash.isZero()) {
 *   // hash is all zeros
 * }
 * ```
 *
 * @remarks
 * - All buffers are exactly 32 bytes (256 bits)
 * - Attempting to create a Buffer32 with wrong size throws an error
 * - Immutable: methods return new instances rather than modifying existing ones
 * - Commonly used for SHA-256 hashes, field elements, and other 32-byte values
 * - Serializable to/from JSON, Buffer, BigInt, and hex strings
 */
export class Buffer32 {
  /**
   * The size of the hash in bytes.
   */
  public static SIZE = 32;

  /**
   * Buffer32 with value zero.
   */
  public static ZERO = new Buffer32(Buffer.alloc(Buffer32.SIZE));

  constructor(
    /**
     * The buffer containing the hash.
     */
    public buffer: Buffer,
  ) {
    if (buffer.length !== Buffer32.SIZE) {
      throw new Error(`Expected buffer to have length ${Buffer32.SIZE} but was ${buffer.length}`);
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
   * Creates a Buffer32 from a buffer.
   * @param buffer - The buffer to create from.
   * @returns A new Buffer32 object.
   */
  public static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Buffer32(reader.readBytes(Buffer32.SIZE));
  }

  /**
   * Checks if this hash and another hash are equal.
   * @param hash - A hash to compare with.
   * @returns True if the hashes are equal, false otherwise.
   */
  public equals(hash: Buffer32): boolean {
    return this.buffer.equals(hash.buffer);
  }

  /**
   * Returns true if this hash is zero.
   * @returns True if this hash is zero.
   */
  public isZero(): boolean {
    return this.buffer.equals(Buffer.alloc(32, 0));
  }

  /**
   * Convert this hash to a hex string.
   * @returns The hex string.
   */
  public toString() {
    return bufferToHex(this.buffer);
  }

  [inspect.custom]() {
    return `Buffer32<${this.toString()}>`;
  }

  toJSON() {
    return this.toString();
  }

  /**
   * Convert this hash to a big int.
   * @returns The big int.
   */
  public toBigInt() {
    return deserializeBigInt(this.buffer, 0, Buffer32.SIZE).elem;
  }
  /**
   * Creates a Buffer32 from a bigint.
   */
  public static fromBigInt(hash: bigint) {
    return new Buffer32(serializeBigInt(hash, Buffer32.SIZE));
  }

  public static fromField(hash: Fr) {
    return new Buffer32(serializeBigInt(hash.toBigInt()));
  }

  /**
   * Creates a Buffer32 from a 28-byte buffer by prepending 4 zero bytes.
   *
   * This method is useful when working with truncated data that needs to be
   * expanded to the standard 32-byte format while preserving the original value
   * in the lower 28 bytes.
   *
   * @param buffer - The 28-byte buffer to construct from. Must be exactly 28 bytes.
   * @returns A Buffer32 with 4 zero bytes prepended (padding at the beginning).
   *
   * @throws {Error} If the input buffer is not exactly 28 bytes.
   *
   * @example
   * ```typescript
   * const data28 = Buffer.alloc(28, 0xff);
   * const buf32 = Buffer32.fromBuffer28(data28);
   * // Result: <00 00 00 00 ff ff ... ff ff> (4 zeros + 28 0xff bytes)
   * ```
   *
   * @remarks
   * - Padding is always added to the high-order (beginning) bytes
   * - The original 28 bytes are preserved in the lower-order bytes
   * - Useful for compatibility with systems that use 28-byte representations
   */
  public static fromBuffer28(buffer: Buffer) {
    if (buffer.length != 28) {
      throw new Error(`Expected Buffer32 input buffer to be 28 bytes`);
    }
    const padded = Buffer.concat([Buffer.alloc(this.SIZE - 28), buffer]);
    return new Buffer32(padded);
  }

  /**
   * Converts a string into a Buffer32 object.
   */
  public static fromString(str: string): Buffer32 {
    if (str.startsWith('0x')) {
      str = str.slice(2);
    }
    if (str.length !== this.SIZE * 2) {
      throw new Error(`Expected string to be ${this.SIZE * 2} characters long, but was ${str.length}`);
    }
    return new Buffer32(Buffer.from(str, 'hex'));
  }

  /**
   * Converts a number into a Buffer32 object.
   * @param num - The number to convert.
   * @returns A new Buffer32 object.
   */
  public static fromNumber(num: number): Buffer32 {
    return new Buffer32(serializeBigInt(BigInt(num), Buffer32.SIZE));
  }

  /**
   * Generates a random Buffer32.
   * @returns A new Buffer32 object.
   */
  public static random(): Buffer32 {
    return new Buffer32(Buffer.from(randomBytes(Buffer32.SIZE)));
  }
}
