import { Buffer32 } from '@aztec/foundation/buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

//   async attest(archive: `0x{string}`): Promise<Attestation> {
//     // @note  Something seems slightly off in viem, think it should be Hex instead of Hash
//     //        but as they both are just `0x${string}` it should be fine anyways.
//     const signature = await this.account.signMessage({ message: { raw: archive } });
//     const { r, s, v } = parseSignature(signature as `0x${string}`);

//     return {
//       isEmpty: false,
//       v: v ? Number(v) : 0,
//       r: r,
//       s: s,
//     };
//   }

export type ViemSignature = {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
  isEmpty: boolean;
};

/**
 * Signature
 */
export class Signature {
  constructor(
    /** The r value of the signature */
    public readonly r: Buffer32,
    /** The s value of the signature */
    public readonly s: Buffer32,
    // TODO: even this can be smaller with different serialization types - ahh
    /** The v value of the signature */
    public readonly v: number,

    public readonly isEmpty: boolean = false,
  ) {}

  static fromBuffer(buf: Buffer | BufferReader): Signature {
    const reader = BufferReader.asReader(buf);
    const r = reader.readObject(Buffer32);
    const s = reader.readObject(Buffer32);

    const isEmpty = r.isZero() && s.isZero();

    return new Signature(r, s, reader.readNumber(), isEmpty);
  }

  static empty(): Signature {
    return new Signature(Buffer32.ZERO, Buffer32.ZERO, 0, true);
  }

  toBuffer(): Buffer {
    // TODO: are there 32byte fixed serialization types to use
    return serializeToBuffer([this.r, this.s, this.v]);
  }

  to0xString(): `0x${string}` {
    return `0x${this.r.toString()}${this.s.toString()}${this.v.toString(16)}`;
  }

  static from0xString(sig: `0x${string}`): Signature {
    const buf = Buffer.from(sig.slice(2), 'hex');
    const reader = BufferReader.asReader(buf);

    const r = reader.readObject(Buffer32);
    const s = reader.readObject(Buffer32);

    const isEmpty = r.isZero() && s.isZero();

    return new Signature(r, s, reader.readUInt8(), isEmpty);
  }

  toViemSignature(): ViemSignature {
    return {
      r: this.r.to0xString(),
      s: this.s.to0xString(),
      v: this.v,
      isEmpty: this.isEmpty,
    };
  }
}
