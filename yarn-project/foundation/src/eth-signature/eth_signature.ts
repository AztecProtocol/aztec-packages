import { Buffer32 } from '@aztec/foundation/buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

import { hasHexPrefix, hexToBuffer } from '../string/index.js';

/**
 * A version of the Signature class that uses `0x${string}` values for r and s rather than Buffer32s
 */
export type ViemSignature = {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
};

/**
 * Contains a signature split into it's primary components (r,s,v)
 */
export class Signature {
  // Cached values
  private size: number | undefined;

  public readonly empty: boolean;

  constructor(
    /** The r value of the signature */
    public readonly r: Buffer32,
    /** The s value of the signature */
    public readonly s: Buffer32,
    /** The v value of the signature */
    public readonly v: number,
  ) {
    this.empty = r.isZero() && s.isZero() && v === 0;
  }

  static fromBuffer(buf: Buffer | BufferReader): Signature {
    const reader = BufferReader.asReader(buf);

    const r = reader.readObject(Buffer32);
    const s = reader.readObject(Buffer32);
    const v = reader.readNumber();

    return new Signature(r, s, v);
  }

  static isValidString(sig: `0x${string}`): boolean {
    return /^0x[0-9a-f]{129,}$/i.test(sig);
  }

  /**
   * A seperate method exists for this as when signing locally with viem, as when
   * parsing from viem, we can expect the v value to be a u8, rather than our
   * default serialization of u32
   */
  static fromString(sig: `0x${string}`): Signature {
    const buf = hexToBuffer(sig);
    const reader = BufferReader.asReader(buf);
    const r = reader.readObject(Buffer32);
    const s = reader.readObject(Buffer32);
    const v = parseInt(sig.slice(2 + 64 * 2), 16);

    return new Signature(r, s, v);
  }

  static fromViemSignature(sig: ViemSignature): Signature {
    return new Signature(Buffer32.fromBuffer(hexToBuffer(sig.r)), Buffer32.fromBuffer(hexToBuffer(sig.s)), sig.v);
  }

  static random(): Signature {
    return new Signature(Buffer32.random(), Buffer32.random(), Math.floor(Math.random() * 2));
  }

  static empty(): Signature {
    return new Signature(Buffer32.ZERO, Buffer32.ZERO, 0);
  }

  isEmpty(): boolean {
    return this.empty;
  }

  equals(other: Signature): boolean {
    return this.r.equals(other.r) && this.s.equals(other.s) && this.v === other.v && this.empty === other.empty;
  }

  toBuffer(): Buffer {
    const buffer = serializeToBuffer([this.r, this.s, this.v]);
    this.size = buffer.length;
    return buffer;
  }

  getSize(): number {
    // We cache size to avoid recalculating it
    if (this.size) {
      return this.size;
    }

    this.size = this.toBuffer().length;
    return this.size;
  }

  toString(): `0x${string}` {
    return `0x${this.r.buffer.toString('hex')}${this.s.buffer.toString('hex')}${this.v.toString(16)}`;
  }

  /**
   * Return the signature with `0x${string}` encodings for r and s
   */
  toViemSignature(): ViemSignature {
    return {
      r: this.r.toString(),
      s: this.s.toString(),
      v: this.v,
    };
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return z
      .string()
      .refine(hasHexPrefix, 'No hex prefix')
      .refine(Signature.isValidString, 'Not a valid Ethereum signature')
      .transform(Signature.fromString);
  }
}
