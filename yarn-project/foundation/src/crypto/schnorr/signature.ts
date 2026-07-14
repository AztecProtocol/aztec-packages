import { Fr } from '@aztec/foundation/curves/bn254';
import { mapTuple } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';

import type { Signature } from '../signature/index.js';

/**
 * Schnorr signature used for transactions.
 * @see cpp/barretenberg/cpp/src/barretenberg/crypto/schnorr/schnorr.hpp
 */
export class SchnorrSignature implements Signature {
  /**
   * The size of the signature in bytes.
   */
  public static SIZE = 64;

  constructor(private buffer: Buffer) {
    if (buffer.length !== SchnorrSignature.SIZE) {
      throw new Error(`Invalid signature buffer of length ${buffer.length}.`);
    }
  }

  /**
   * Deserializes from a buffer.
   * @param buffer - The 64-byte signature buffer.
   * @returns A SchnorrSignature instance.
   */
  static fromBuffer(buffer: Buffer): SchnorrSignature {
    return new SchnorrSignature(buffer);
  }

  /**
   * Deserializes from a hex string, as produced by `toString()`.
   * @param str - The signature as a hex string (with or without the 0x prefix).
   * @returns A SchnorrSignature instance.
   */
  static fromString(str: string): SchnorrSignature {
    return new SchnorrSignature(hexToBuffer(str));
  }

  /**
   * Returns the 's' component of the signature.
   * @returns A buffer containing the signature's 's' component.
   */
  get s() {
    return this.buffer.subarray(0, 32);
  }

  /**
   * Returns the 'e' component of the signature.
   * @returns A buffer containing the signature's 'e' component.
   */
  get e() {
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
   * Returns the full signature as a hex string.
   * @returns A string containing the signature in hex format.
   */
  toString() {
    return `0x${this.buffer.toString('hex')}`;
  }

  /** Serializes to a hex string for JSON, so instances round-trip through `jsonStringify`. */
  toJSON() {
    return this.toString();
  }

  /**
   * Converts the signature to an array of three fields.
   * @returns The signature components as an array of three fields
   */
  toFields(): Fr[] {
    const sig = this.toBuffer();

    const buf1 = Buffer.alloc(32);
    const buf2 = Buffer.alloc(32);
    const buf3 = Buffer.alloc(32);

    sig.copy(buf1, 1, 0, 31);
    sig.copy(buf2, 1, 31, 62);
    sig.copy(buf3, 1, 62, 64);

    return mapTuple([buf1, buf2, buf3], Fr.fromBuffer);
  }

  /**
   * Splits the signature into the four 128-bit limbs that Noir's `EmbeddedCurveScalar` consumes:
   * `[s.lo, s.hi, e.lo, e.hi]`, where each component scalar is encoded as `lo + hi * 2^128`.
   *
   * Each 32-byte big-endian component is sliced into its top 16 bytes (`hi`) and bottom 16 bytes
   * (`lo`); each half is zero-padded into a 32-byte buffer and decoded as `Fr` (big-endian).
   */
  toLimbFields(): [Fr, Fr, Fr, Fr] {
    const limb = (start: number) => {
      const buf = Buffer.alloc(32);
      this.buffer.copy(buf, 16, start, start + 16);
      return Fr.fromBuffer(buf);
    };
    return [limb(16), limb(0), limb(48), limb(32)];
  }
}
