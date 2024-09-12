import { type Signature } from '@aztec/foundation/eth-signature';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Buffer32 } from '@aztec/foundation/buffer';

import { type ValidatorKeyStore } from './interface.js';

/**
 * Local Key Store
 *
 * An implementation of the Key store using an in memory private key.
 */
export class LocalKeyStore implements ValidatorKeyStore {
  private signer: Secp256k1Signer;

  constructor(privateKey: string) {
    this.signer = new Secp256k1Signer(Buffer32.fromString(privateKey));
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
