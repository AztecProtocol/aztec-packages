import { randomBytes } from 'crypto';
import { toBigIntBE, toBufferBE } from '../index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

/**
 * Secp256k1Fr represents the subgroup field with order being the prime number MODULUS.
 * The scalar (i.e. Private key) when multiplying to a secp256k1 group element must be a Secp256k1Fr.
 * It provides utility functions to work with elements in this field, such as conversions
 * between different representations and checks for equality and zero values. The elements can be
 * serialized to and deserialized from byte buffers or strings. Some use cases include working with
 * cryptographic operations and finite fields.
 */
export class Secp256k1Fr {
  static ZERO = new Secp256k1Fr(0n);
  static MODULUS = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  static MAX_VALUE = Secp256k1Fr.MODULUS - 1n;
  static SIZE_IN_BYTES = 32;

  constructor(
    /**
     * The numeric value of the field element as a bigint.
     */
    public readonly value: bigint,
  ) {
    if (value > Secp256k1Fr.MAX_VALUE) {
      throw new Error(`Secp256k1Fr out of range ${value}.`);
    }
  }

  /**
   * Generates a random Secp256k1Fr instance with a value modulo the respective class' MODULUS.
   * This method uses randomBytes to generate a random 32-byte buffer, converts it to a bigint
   * and takes the modulus of the result with the class' MODULUS constant.
   *
   * @returns A new Secp256k1Fr instance with a random value.
   */
  static random() {
    const r = toBigIntBE(randomBytes(Secp256k1Fr.SIZE_IN_BYTES)) % Secp256k1Fr.MODULUS;
    return new Secp256k1Fr(r);
  }

  /**
   * Returns a new zero-value field.
   * @returns A new zero-value field.
   */
  static zero() {
    return new Secp256k1Fr(0n);
  }

  /**
   * Create an instance of the corresponding class (Secp256k1Fr) from a Buffer or a BufferReader.
   * Reads 'SIZE_IN_BYTES' bytes from the given Buffer or BufferReader and constructs an instance with the decoded value.
   * If the input is a Buffer, it is internally converted to a BufferReader before reading.
   * Throws an error if the input length is invalid or the decoded value is out of range.
   *
   * @param buffer - The Buffer or BufferReader containing the bytes representing the value.
   * @returns An instance of the corresponding class (Secp256k1Fr) with the decoded value.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Secp256k1Fr(toBigIntBE(reader.readBytes(Secp256k1Fr.SIZE_IN_BYTES)));
  }

  /**
   * Create a Secp256k1Fr instance from a hex-encoded string.
   * The input 'scalar' can be either prefixed with '0x' or not, and should have exactly 64 hex characters.
   * Throws an error if the input length is invalid or the scalar value is out of range.
   *
   * @param scalar - The hex-encoded string representing the field element.
   * @returns A Secp256k1Fr instance.
   */
  static fromString(scalar: string) {
    return Secp256k1Fr.fromBuffer(Buffer.from(scalar.replace(/^0x/i, ''), 'hex'));
  }

  /**
   * Converts the value of the instance to a buffer with a specified length.
   * The method uses the provided value and size in bytes to create a buffer representation
   * of the numeric value. This can be useful for serialization and communication purposes.
   *
   * @returns A buffer representing the instance's value.
   */
  toBuffer() {
    return toBufferBE(this.value, Secp256k1Fr.SIZE_IN_BYTES);
  }

  /**
   * Converts the value of the Secp256k1Fr or Fq class instance to a hexadecimal string.
   * The resulting string is prefixed with '0x' and represents the bigint value
   * in base 16.
   *
   * @returns A hex-encoded string representing the value of the class instance.
   */
  toString() {
    return '0x' + this.value.toString(16);
  }

  /**
   * Returns a shortened string representation of the Secp256k1Fr value, formatted with '0x' prefix and ellipsis in the middle.
   * The resulting string has first 10 characters (including '0x') and last 4 characters of the full hexadecimal value.
   *
   * @returns A shorter, human-readable string representation of the Secp256k1Fr value.
   */
  toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  /**
   * Checks if the provided Secp256k1Fr instance is equal to the current instance.
   * Two instances are considered equal if their 'value' properties are the same.
   *
   * @param rhs - The Secp256k1Fr instance to compare with the current instance.
   * @returns A boolean indicating whether the two instances are equal.
   */
  equals(rhs: Secp256k1Fr) {
    return this.value === rhs.value;
  }

  /**
   * Check if the instance value is zero.
   * The method returns true if the value of the instance is 0n (zero in BigInt representation),
   * otherwise, it returns false.
   *
   * @returns A boolean indicating whether the instance value is zero or not.
   */
  isZero() {
    return this.value === 0n;
  }

  /**
   * Converts the current value of the Fq or Secp256k1Fr instance to a friendly JSON representation.
   * The output will be a hexadecimal string prefixed with '0x'.
   *
   * @returns A '0x' prefixed hexadecimal string representing the current value.
   */
  toSecp256k1FriendlyJSON() {
    return this.toString();
  }
}
