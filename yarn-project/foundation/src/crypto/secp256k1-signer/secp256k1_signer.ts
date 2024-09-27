import { Buffer32 } from '@aztec/foundation/buffer';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type Signature } from '@aztec/foundation/eth-signature';

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

  constructor(private privateKey: Buffer32) {
    this.address = addressFromPrivateKey(privateKey.buffer);
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

  static random(): Secp256k1Signer {
    return new Secp256k1Signer(Buffer32.random());
  }
}
