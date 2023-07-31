import { toBigIntBE, toBufferBE, toHex } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/index.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { Curve, curveModulus } from './curve.js';

/**
 * Field represents a field of integers modulo the prime number MODULUS. It provides utility functions to work with
 * elements in this field, such as conversions between different representations and checks for equality and zero
 * values. The elements can be serialized to and deserialized from byte buffers or strings. Some use cases include
 * working with cryptographic operations and finite fields.
 */
export class Field {
  static SIZE_IN_BYTES = 32;

  constructor(
    /**
     * The curve whose modulus is used for this field.
     */
    public readonly curve: Curve,
    /**
     * The numeric value of the field element as a bigint.
     */
    public readonly value: bigint,
  ) {
    const maxValue = curveModulus[curve] - 1n;
    if (value > maxValue) {
      throw new Error(`Field out of range ${value}.`);
    }
  }

  /**
   * Generates a random Field or Fq instance with a value modulo the respective class' MODULUS.
   * This method uses randomBytes to generate a random 32-byte buffer, converts it to a bigint
   * and takes the modulus of the result with the class' MODULUS constant.
   * @param curve - The curve whose modulus should be used.
   * @returns A new Field or Fq instance with a random value.
   */
  static random(curve: Curve) {
    const r = toBigIntBE(randomBytes(Field.SIZE_IN_BYTES)) % curveModulus[curve];
    return new Field(curve, r);
  }

  /**
   * Returns a new zero-value field.
   * @param curve - The curve whose modulus should be used.
   * @returns A new zero-value field.
   */
  static zero(curve: Curve) {
    return new Field(curve, 0n);
  }

  /**
   * Create an instance of the corresponding class (Field or Fq) from a Buffer or a BufferReader.
   * Reads 'SIZE_IN_BYTES' bytes from the given Buffer or BufferReader and constructs an instance with the decoded value.
   * If the input is a Buffer, it is internally converted to a BufferReader before reading.
   * Throws an error if the input length is invalid or the decoded value is out of range.
   *
   * @param curve - The curve whose modulus should be used.
   * @param buffer - The Buffer or BufferReader containing the bytes representing the value.
   * @returns An instance of the corresponding class (Field or Fq) with the decoded value.
   */
  static fromBuffer(curve: Curve, buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Field(curve, toBigIntBE(reader.readBytes(Field.SIZE_IN_BYTES)));
  }

  /**
   * Create a Field instance from a hex-encoded string.
   * The input 'address' can be either prefixed with '0x' or not, and should have exactly 64 hex characters.
   * Throws an error if the input length is invalid or the address value is out of range.
   *
   * @param curve - The curve whose modulus should be used.
   * @param address - The hex-encoded string representing the field element.
   * @returns A Field instance.
   */
  static fromString(curve: Curve, address: string) {
    return Field.fromBuffer(curve, Buffer.from(address.replace(/^0x/i, ''), 'hex'));
  }

  /**
   * Converts the value of the instance to a buffer with a specified length.
   * The method uses the provided value and size in bytes to create a buffer representation
   * of the numeric value. This can be useful for serialization and communication purposes.
   *
   * @returns A buffer representing the instance's value.
   */
  toBuffer() {
    return toBufferBE(this.value, Field.SIZE_IN_BYTES);
  }

  /**
   * Converts the value of the Field or Fq class instance to a hexadecimal string.
   * The resulting string is prefixed with '0x' and represents the bigint value
   * in base 16.
   *
   * @param padTo32 - Whether to pad the string to 32 bytes.
   * @returns A hex-encoded string representing the value of the class instance.
   */
  toString(padTo32 = false): `0x${string}` {
    return toHex(this.value, padTo32);
  }

  /**
   * Retrieves the underlying bigint.
   * This method mostly exists to match user expectations, as value is already public.
   * @returns The underlying bigint.
   */
  public toBigInt(): bigint {
    return this.value;
  }

  /**
   * Returns a shortened string representation of the Field value, formatted with '0x' prefix and ellipsis in the middle.
   * The resulting string has first 10 characters (including '0x') and last 4 characters of the full hexadecimal value.
   *
   * @returns A shorter, human-readable string representation of the Field value.
   */
  toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  /**
   * Checks if the provided Field instance is equal to the current instance.
   * Two instances are considered equal if their 'value' properties are the same.
   *
   * @param rhs - The Field instance to compare with the current instance.
   * @returns A boolean indicating whether the two instances are equal.
   */
  equals(rhs: Field) {
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
   * Converts the current value of the Fq or Field instance to a friendly JSON representation.
   * The output will be a hexadecimal string prefixed with '0x'.
   *
   * @returns A '0x' prefixed hexadecimal string representing the current value.
   */
  toFriendlyJSON() {
    return this.toString();
  }
}
