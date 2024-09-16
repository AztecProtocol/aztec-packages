import { type Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { type Signature } from '@aztec/foundation/eth-signature';

import { type ValidatorKeyStore } from './interface.js';

/**
 * Local Key Store
 *
 * An implementation of the Key store using an in memory private key.
 */
export class LocalKeyStore implements ValidatorKeyStore {
  private signer: Secp256k1Signer;

  constructor(privateKey: Buffer32) {
    this.signer = new Secp256k1Signer(privateKey);
  }

  /**
   * Sign a message with the keystore private key
   *
   * @param messageBuffer - The message buffer to sign
   * @return signature
   */
  public sign(digest: Buffer32): Promise<Signature> {
    const signature = this.signer.sign(digest);

    return Promise.resolve(signature);
  }
}
