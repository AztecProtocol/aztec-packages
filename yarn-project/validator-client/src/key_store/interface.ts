import type { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

/** Key Store
 *
 * A keystore interface that can be replaced with a local keystore / remote signer service
 */
export interface ValidatorKeyStore {
  /**
   * Get the address of a signer by index
   *
   * @param index - The index of the signer
   * @returns the address
   */
  getAddress(index: number): EthAddress;

  /**
   * Get all addresses
   *
   * @returns all addresses
   */
  getAddresses(): EthAddress[];

  sign(message: Buffer32): Promise<Signature[]>;
  signWithAddress(address: EthAddress, message: Buffer32): Promise<Signature>;
  /**
   * Flavor of sign message that followed EIP-712 eth signed message prefix
   * Note: this is only required when we are using ecdsa signatures over secp256k1
   *
   * @param message - The message to sign.
   * @returns The signatures.
   */
  signMessage(message: Buffer32): Promise<Signature[]>;
  signMessageWithAddress(address: EthAddress, message: Buffer32): Promise<Signature>;
}
