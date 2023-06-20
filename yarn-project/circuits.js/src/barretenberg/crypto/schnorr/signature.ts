import { randomBytes } from '@aztec/foundation/crypto';
import { Signature } from '../index.js';
import { BufferReader } from '@aztec/foundation/serialize';
import { Fr } from '@aztec/foundation/fields';

/**
 * Schnorr signature used for transactions.
 * @see cpp/barretenberg/cpp/src/barretenberg/crypto/schnorr/schnorr.hpp
 */
export class SchnorrSignature implements Signature {
  /**
   * The size of the signature in bytes.
   */
  public static SIZE = 64;

  /**
   * An empty signature.
   */
  public static EMPTY = new SchnorrSignature(Buffer.alloc(64));

  constructor(private buffer: Buffer) {
    if (buffer.length !== SchnorrSignature.SIZE) {
      throw new Error(`Invalid signature buffer of length ${buffer.length}.`);
    }
  }

  /**
   * Determines if the provided signature is valid or not.
   * @param signature - The data to be checked.
   * @returns Boolean indicating if the provided data is a valid schnorr signature.
   */
  public static isSignature(signature: string) {
    return /^(0x)?[0-9a-f]{128}$/i.test(signature);
  }

  /**
   * Constructs a SchnorrSignature from the provided string.
   * @param signature - The string to be converted to a schnorr signature.
   * @returns The constructed schnorr signature.
   */
  public static fromString(signature: string) {
    if (!SchnorrSignature.isSignature(signature)) {
      throw new Error(`Invalid signature string: ${signature}`);
    }
    return new SchnorrSignature(Buffer.from(signature.replace(/^0x/i, ''), 'hex'));
  }

  /**
   * Generates a random schnorr signature.
   * @returns The randomly constructed signature.
   */
  public static random() {
    return new SchnorrSignature(randomBytes(64));
  }

  /**
   * Returns the 's' component of the signature.
   * @returns A buffer containing the signature's 's' component.
   */
  s() {
    return this.buffer.subarray(0, 32);
  }

  /**
   * Returns the 'e' component of the signature.
   * @returns A buffer containing the signature's 'e' component.
   */
  e() {
    return this.buffer.subarray(32);
  }

  /**
   * Returns the full signature as a buffer.
   * @returns A buffer containing the signature.
   */
  toBuffer() {
    return this.buffer;
  }

  /**
   * Deserialises from a buffer.
   * @param buffer - The buffer representation of the object.
   * @returns The new object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SchnorrSignature {
    const reader = BufferReader.asReader(buffer);
    return new SchnorrSignature(reader.readBytes(SchnorrSignature.SIZE));
  }

  /**
   * Returns the full signature as a hex string.
   * @returns A string containing the signature in hex format.
   */
  toString() {
    return `0x${this.buffer.toString('hex')}`;
  }

  /**
   * Converts the signature to an array of fields.
   * @returns The signature components as an array of fields
   */
  toFields(): Fr[] {
    return [Fr.fromBuffer(this.buffer.subarray(0, 32)), Fr.fromBuffer(this.buffer.subarray(32, 64))];
  }
}
