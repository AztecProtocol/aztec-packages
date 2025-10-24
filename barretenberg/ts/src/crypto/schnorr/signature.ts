import { randomBytes } from '../../random/index.js';
import { BufferReader } from '../../serialize/index.js';

/**
 * Schnorr signature.
 * @see cpp/barretenberg/cpp/src/barretenberg/crypto/schnorr/schnorr.hpp
 */
export class SchnorrSignature {
  public static SIZE = 64;
  public static EMPTY = new SchnorrSignature(Buffer.alloc(64));

  constructor(private buffer: Buffer) {
    if (buffer.length !== SchnorrSignature.SIZE) {
      throw new Error(`Invalid signature buffer of length ${buffer.length}.`);
    }
  }

  static isSignature(signature: string) {
    return /^(0x)?[0-9a-f]{128}$/i.test(signature);
  }

  static fromString(signature: string) {
    if (!SchnorrSignature.isSignature(signature)) {
      throw new Error(`Invalid signature string: ${signature}`);
    }
    return new SchnorrSignature(Buffer.from(signature.replace(/^0x/i, ''), 'hex'));
  }

  static random() {
    return new SchnorrSignature(Buffer.from(randomBytes(64)));
  }

  get s() {
    return Buffer.from(this.buffer.subarray(0, 32));
  }

  get e() {
    return Buffer.from(this.buffer.subarray(32));
  }

  toBuffer() {
    return this.buffer;
  }

  static fromBuffer(buffer: Buffer | BufferReader): SchnorrSignature {
    const reader = BufferReader.asReader(buffer);
    return new SchnorrSignature(Buffer.from(reader.readBytes(SchnorrSignature.SIZE)));
  }

  toString() {
    return `0x${this.buffer.toString('hex')}`;
  }
}
