import { bigIntToBufferBE } from '../../bigint-array/index.js';
import { randomBytes } from '../../random/index.js';

/**
 * ECDSA signature.
 * @see cpp/barretenberg/cpp/src/barretenberg/crypto/ecdsa/ecdsa.hpp
 */
export class EcdsaSignature {
  constructor(
    public r: Buffer,
    public s: Buffer,
    public v: Buffer,
  ) {
    if (r.length != 32) {
      throw new Error(`Invalid length of 'r' in ECDSA signature. Expected 32, got ${r.length}`);
    }
    if (s.length != 32) {
      throw new Error(`Invalid length of 's' in ECDSA signature. Expected 32, got ${s.length}`);
    }
    if (v.length != 1) {
      throw new Error(`Invalid length of 'v' in ECDSA signature. Expected 1, got ${v.length}`);
    }
  }

  toBuffer() {
    return Buffer.concat([this.r, this.s, this.v]);
  }

  public static fromBuffer(buffer: Buffer) {
    return new EcdsaSignature(buffer.subarray(0, 32), buffer.subarray(32, 64), buffer.subarray(64, 65));
  }

  public static fromBigInts(r: bigint, s: bigint, v: number) {
    return new EcdsaSignature(bigIntToBufferBE(r, 32), bigIntToBufferBE(s, 32), Buffer.from([v]));
  }

  public static random() {
    return new EcdsaSignature(Buffer.from(randomBytes(32)), Buffer.from(randomBytes(32)), Buffer.from([27]));
  }

  toString() {
    return `0x${this.toBuffer().toString('hex')}`;
  }
}
