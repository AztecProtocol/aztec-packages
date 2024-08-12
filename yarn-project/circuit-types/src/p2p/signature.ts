import { BufferReader, serializeToBuffer } from "@aztec/foundation/serialize";

import {Buffer32} from "@aztec/foundation/buffer";

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
    ) {}

    static fromBuffer(buf: Buffer | BufferReader): Signature {
        const reader = BufferReader.asReader(buf);
        return new Signature(
            reader.readNumber(),
            reader.readObject(Buffer32),
            reader.readObject(Buffer32),
        );
    }

    static empty(): Signature {
        return new Signature(Buffer32.ZERO, Buffer32.ZERO, 0);
    }

    toBuffer(): Buffer {
        // TODO: are there 32byte fixed serialization types to use
        return serializeToBuffer([this.r, this.s, this.v]);
    }

    to0xString(): `0x${string}` {
        return `0x${this.r.toString()}${this.s.toString()}${this.v.toString(16)}`;
    }
}