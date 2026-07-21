import { randomBytes } from '@aztec/foundation/crypto/random';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, deserializeBigInt, serializeBigInt } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { bufferToHex } from '../string/index.js';

/**
 * Abstract unbranded base class for 32-byte buffers.
 * Extend this instead of Buffer32 when defining a branded subtype
 * to avoid inheriting Buffer32's `_branding`.
 */
export abstract class BaseBuffer32 {
  /** The size of the buffer in bytes. */
  public static SIZE = 32;

  constructor(
    /** The buffer containing the data. */
    public buffer: Buffer,
  ) {
    if (buffer.length !== BaseBuffer32.SIZE) {
      throw new Error(`Expected buffer to have length ${BaseBuffer32.SIZE} but was ${buffer.length}`);
    }
  }

  /** Returns the raw buffer. */
  public toBuffer() {
    return this.buffer;
  }

  /** Checks if this and another buffer are equal. */
  public equals(hash: BaseBuffer32): boolean {
    return this.buffer.equals(hash.buffer);
  }

  /** Returns true if all bytes are zero. */
  public isZero(): boolean {
    return this.buffer.equals(Buffer.alloc(32, 0));
  }

  /** Convert to a hex string. */
  public toString() {
    return bufferToHex(this.buffer);
  }

  [inspect.custom]() {
    return `Buffer32<${this.toString()}>`;
  }

  toJSON() {
    return this.toString();
  }

  /** Convert to a big int. */
  public toBigInt() {
    return deserializeBigInt(this.buffer, 0, BaseBuffer32.SIZE).elem;
  }
}

/** A branded 32-byte buffer. */
export class Buffer32 extends BaseBuffer32 {
  /** Branding for nominal typing. */
  declare private readonly _branding: 'Buffer32';

  /** Buffer32 with value zero. */
  public static ZERO = new Buffer32(Buffer.alloc(Buffer32.SIZE));

  /** Creates a Buffer32 from a buffer. */
  public static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Buffer32(reader.readBytes(Buffer32.SIZE));
  }

  /** Creates a Buffer32 from a bigint. */
  public static fromBigInt(hash: bigint) {
    return new Buffer32(serializeBigInt(hash, Buffer32.SIZE));
  }

  public static fromField(hash: Fr) {
    return new Buffer32(serializeBigInt(hash.toBigInt()));
  }

  /**
   * Converts from a buffer of 28 bytes.
   * @param buffer - The 28 byte buffer to construct from.
   * @returns A Buffer32 created from the input buffer with 4 bytes 0 padding at the front.
   */
  public static fromBuffer28(buffer: Buffer) {
    if (buffer.length != 28) {
      throw new Error(`Expected Buffer32 input buffer to be 28 bytes`);
    }
    const padded = Buffer.concat([Buffer.alloc(Buffer32.SIZE - 28), buffer]);
    return new Buffer32(padded);
  }

  /** Converts a string into a Buffer32 object. */
  public static fromString(str: string): Buffer32 {
    if (str.startsWith('0x')) {
      str = str.slice(2);
    }
    if (str.length !== Buffer32.SIZE * 2) {
      throw new Error(`Expected string to be ${Buffer32.SIZE * 2} characters long, but was ${str.length}`);
    }
    return new Buffer32(Buffer.from(str, 'hex'));
  }

  /** Converts a number into a Buffer32 object. */
  public static fromNumber(num: number): Buffer32 {
    return new Buffer32(serializeBigInt(BigInt(num), Buffer32.SIZE));
  }

  /** Generates a random Buffer32. */
  public static random(): Buffer32 {
    return new Buffer32(Buffer.from(randomBytes(Buffer32.SIZE)));
  }
}
