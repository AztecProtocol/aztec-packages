import { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

import { signMessageWithCustomK } from './custom_k_signing.js';
import { KValuePool } from './k_pool.js';
import { addressFromPrivateKey, makeEthSignDigest, signMessage } from './utils.js';

/**
 * Secp256k1Signer
 *
 * A class for signing messages using a secp256k1 private key.
 * - This is a slim drop in replacement for an Ethereum signer, so it can be used in the same way.
 * - See `utils.ts` for functions that enable recovering addresses and public keys from signatures.
 */
export class Secp256k1Signer {
  public readonly address: EthAddress;
  private kPool: KValuePool;

  constructor(private privateKey: Buffer32) {
    this.address = addressFromPrivateKey(privateKey.buffer);
    this.kPool = new KValuePool(1000); // Initialize with 1000 k values
  }

  sign(message: Buffer32): Signature {
    return signMessage(message, this.privateKey.buffer);
  }

  /**
   * Sign a message using the same method as eth_sign
   * @param message - The message to sign.
   * @returns The signature.
   */
  signMessage(message: Buffer32): Signature {
    const digest = makeEthSignDigest(message);
    return this.sign(digest);
  }

  /**
   * Sign a message using ECDSA with a custom k value from the pool at specified index
   *
   * WARNING: This creates non-deterministic signatures. Only for testing purposes.
   *
   * @param message - The message to sign (will be hashed)
   * @param kIndex - The index in the k pool to use for this signature
   * @returns A valid ECDSA signature with the k value at the specified index
   */
  signWithCustomK(message: Buffer32, kIndex: number): Signature {
    const k = this.kPool.getK(kIndex);
    return signMessageWithCustomK(message, this.privateKey.buffer, k);
  }

  /**
   * Sign a message using eth_sign format with custom k at specified index
   * Adds Ethereum signed message prefix before signing
   *
   * @param message - The message to sign
   * @param kIndex - The index in the k pool to use for this signature
   * @returns Signature with eth_sign digest
   */
  signMessageWithCustomK(message: Buffer32, kIndex: number): Signature {
    const digest = makeEthSignDigest(message);
    return this.signWithCustomK(digest, kIndex);
  }

  static random(): Secp256k1Signer {
    return new Secp256k1Signer(Buffer32.random());
  }
}
