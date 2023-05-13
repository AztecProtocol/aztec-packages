import { assertLength } from '@aztec/foundation/utils';
import { randomBytes } from 'crypto';

/**
 * ECDSA signature used for transactions.
 * @see cpp/barretenberg/cpp/src/barretenberg/crypto/ecdsa/ecdsa.hpp
 */
export class EcdsaSignature {
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
    assertLength(this, 'r', 32);
    assertLength(this, 's', 32);
    assertLength(this, 'v', 1);
  }

  /**
   * Converts an ECDSA signature to a buffer.
   * @returns A buffer.
   */
  toBuffer() {
    return Buffer.concat([this.r, this.s, this.v]);
  }

  /**
   * Generate a random ECDSA signature for testing.
   * @returns A randomly generated ECDSA signature (not a valid one).
   */
  public static random() {
    return new EcdsaSignature(randomBytes(32), randomBytes(32), Buffer.from([27]));
  }

  /**
   * Convert an ECDSA signature to a buffer.
   * @returns A 65-character string of the form 0x<r><s><v>.
   */
  toString() {
    return `0x${this.toBuffer().toString('hex')}`;
  }
}
