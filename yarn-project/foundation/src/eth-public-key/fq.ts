import { randomBytes } from 'crypto';
import { toBigIntBE, toBufferBE } from '../index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

/**
 * Secp256k1Fq represents a scalar in a coordinate field with modulus defined by the constant MODULUS.
 * It provides methods for creating, manipulating, and comparing field elements, as well as converting
 * them to/from different data types like Buffers and hex strings. Field elements are used in various
 * cryptographic protocols and operations, such as elliptic curve cryptography.
 *
 * @example
 * const fqElem = new Secp256k1Fq(BigInt("123456789"));
 * const randomSecp256k1FqElem = Secp256k1Fq.random();
 * const fromBufferSecp256k1FqElem = Secp256k1Fq.fromBuffer(buffer);
 */
export class Secp256k1Fq {
  static MODULUS = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  static MAX_VALUE = Secp256k1Fq.MODULUS - 1n;
  static SIZE_IN_BYTES = 32;

  constructor(
    /**
     * The element's value as a bigint in the finite field.
     */
    public readonly value: bigint,
  ) {
    if (value > Secp256k1Fq.MAX_VALUE) {
      throw new Error(`Secp256k1Fq out of range ${value}.`);
    }
  }

  /**
   * Generates a random Secp256k1Fq instance with a value within the range of their respective modulus.
   * The random value is generated from a byte array of length equal to SIZE_IN_BYTES, then truncated
   * to the appropriate modulus before creating the new Secp256k1Fq instance.
   *
   * @returns A new Secp256k1Fq instance with a randomly generated value.
   */
  static random() {
    const r = toBigIntBE(randomBytes(32)) % Secp256k1Fq.MODULUS;
    return new Secp256k1Fq(r);
  }

  /**
   * Create an instance of the calling class (Secp256k1Fq) from a given buffer or BufferReader.
   * Reads SIZE_IN_BYTES from the provided buffer and converts it to a bigint, then creates a new instance
   * with that value. Throws an error if the value is out of range for the calling class.
   *
   * @param buffer - The input buffer or BufferReader containing the bytes representing the value.
   * @returns An instance of the calling class (Secp256k1Fq) initialized with the bigint value.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Secp256k1Fq(toBigIntBE(reader.readBytes(this.SIZE_IN_BYTES)));
  }

  /**
   * Converts the bigint value of the instance to a Buffer representation.
   * The output buffer has a fixed size, determined by the 'SIZE_IN_BYTES' constant.
   *
   * @returns A Buffer containing the byte representation of the instance's value.
   */
  toBuffer() {
    return toBufferBE(this.value, Secp256k1Fq.SIZE_IN_BYTES);
  }

  /**
   * Converts the Secp256k1Fq value to a hexadecimal string representation.
   * The resulting string is prefixed with '0x' and contains the exact number of hex characters required
   * to represent the numeric value of this instance.
   *
   * @returns A hexadecimal string representing the Secp256k1Fq value.
   */
  toString() {
    return '0x' + this.value.toString(16);
  }

  /**
   * Check if the value of the current instance is zero.
   * This function compares the internal 'value' property with 0n (BigInt representation of zero).
   * Returns true if the value is zero, otherwise returns false.
   *
   * @returns A boolean indicating whether the value is zero or not.
   */
  isZero() {
    return this.value === 0n;
  }

  /**
   * Converts the value of the Fr or Secp256k1Fq instance to a friendly JSON format.
   * The output is a hexadecimal string representation of the value with '0x' prefix.
   *
   * @returns A string representing the value in the JSON format.
   */
  toFriendlyJSON() {
    return this.toString();
  }
}
