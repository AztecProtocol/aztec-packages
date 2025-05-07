import { randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, deserializeBigInt, serializeBigInt } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { bufferToHex } from '../string/index.js';

/**
 * A class representing a 16 byte Buffer.
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
