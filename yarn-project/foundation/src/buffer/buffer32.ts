import { randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, deserializeBigInt, serializeBigInt } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { bufferToHex } from '../string/index.js';

/**
 * A class representing a 32 byte Buffer.
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
   * Converts this hash from a buffer of 28 bytes.
   * Verifies the input is 28 bytes.
   * @param buffer - The 28 byte buffer to construct from.
   * @returns A Buffer32 created from the input buffer with 4 bytes 0 padding at the front.
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
