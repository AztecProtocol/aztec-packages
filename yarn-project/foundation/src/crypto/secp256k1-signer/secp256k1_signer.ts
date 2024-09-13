import { type Buffer32 } from '@aztec/foundation/buffer';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type Signature } from '@aztec/foundation/eth-signature';

import { addressFromPrivateKey, signMessage } from './utils.js';

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
}
