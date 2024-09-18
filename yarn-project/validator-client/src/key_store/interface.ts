import { type Buffer32 } from '@aztec/foundation/buffer';
import { type Signature } from '@aztec/foundation/eth-signature';

/** Key Store
 *
 * A keystore interface that can be replaced with a local keystore / remote signer service
 */
export interface ValidatorKeyStore {
  sign(message: Buffer32): Promise<Signature>;
  /**
   * Flavor of sign message that followed EIP-712 eth signed message prefix
   * Note: this is only required when we are using ecdsa signatures over secp256k1
   *
   * @param message - The message to sign.
   * @returns The signature.
   */
  signMessage(message: Buffer32): Promise<Signature>;
}
