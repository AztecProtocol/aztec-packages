import { secp256k1 } from '@noble/curves/secp256k1';
import { AztecAddress, EntrypointPayload } from '../index.js';
import { AuthPayload, TxAuthProvider } from './index.js';

import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { mapTuple } from '@aztec/foundation/serialize';

/**
 * ECDSA signature used for transactions.
 * Copied from yarn-project/circuits.js/src/barretenberg/crypto/ecdsa/signature.ts to avoid dependency on circuits.js
 * TODO: Remove duplication
 */
class EcdsaSignature {
  constructor(
    /**
     * The r byte-array (32 bytes) in an ECDSA signature.
     */
    public r: Buffer,
    /**
     * The s byte-array (32 bytes) in an ECDSA signature.
     */
    public s: Buffer,
    /**
     * The recovery id (1 byte) in an ECDSA signature.
     */
    public v: Buffer,
  ) {
    if (r.length != 32) {
      throw new Error(`Invalid length of 'r' in ECDSA signature`);
    }
    if (s.length != 32) {
      throw new Error(`Invalid length of 's' in ECDSA signature`);
    }
    if (v.length != 1) {
      throw new Error(`Invalid length of '1' in ECDSA signature`);
    }
  }

  /**
   * Converts an ECDSA signature to a buffer.
   * @returns A buffer.
   */
  toBuffer() {
    return Buffer.concat([this.r, this.s, this.v]);
  }

  /**
   * Deserialises the signature from a buffer.
   * @param buffer - The buffer from which to deserialise the signature.
   * @returns The ECDSA signature
   */
  public static fromBuffer(buffer: Buffer) {
    return new EcdsaSignature(buffer.subarray(0, 32), buffer.subarray(32, 64), buffer.subarray(64, 65));
  }

  /**
   * Convert an ECDSA signature to a buffer.
   * @returns A 65-character string of the form 0x<r><s><v>.
   */
  toString() {
    return `0x${this.toBuffer().toString('hex')}`;
  }

  static fromBigInts(r: bigint, s: bigint, v: number) {
    return new EcdsaSignature(toBufferBE(r, 32), toBufferBE(s, 32), Buffer.from([v]));
  }

  /**
   * Converts the signature to an array of fields.
   * @param includeV - Determines whether the 'v' term is included
   * @returns The signature components as an array of fields
   */
  toFields(includeV = false): Fr[] {
    const sig = this.toBuffer();

    const buf1 = Buffer.alloc(32);
    const buf2 = Buffer.alloc(32);
    const buf3 = Buffer.alloc(32);

    sig.copy(buf1, 1, 0, 31);
    sig.copy(buf2, 1, 31, 62);
    sig.copy(buf3, 1, 62, includeV ? 65 : 64);

    return mapTuple([buf1, buf2, buf3], Fr.fromBuffer);
  }
}

export class EcdsaAuthProvider implements TxAuthProvider {
  constructor(private privKey: Buffer) {}
  authenticateTx(payload: EntrypointPayload, payloadHash: Buffer, _address: AztecAddress): Promise<AuthPayload> {
    const sig = secp256k1.sign(payloadHash, this.privKey);
    if (sig.recovery === undefined) throw new Error(`Missing recovery from signature`);
    return Promise.resolve(EcdsaSignature.fromBigInts(sig.r, sig.s, sig.recovery));
  }
}
