import { PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { ValidatorKeyStore } from './index.js';
import {Signature} from "@aztec/circuit-types";

/**
 * Local Key Store
 *
 * An implementation of the Key store using an in memory private key.
 */
export class LocalKeyStore implements ValidatorKeyStore {
  private signer: PrivateKeyAccount;

  constructor(privateKey: string) {
    this.signer = privateKeyToAccount(privateKey as `0x{string}`);
  }

  /**
   * Sign a message with the keystore private key
   *
   * @param messageBuffer - The message buffer to sign
   * @return signature
   */
  public async sign(messageBuffer: Buffer): Promise<Signature> {
    const message = `0x${messageBuffer.toString('hex')}`;
    const signature = await this.signer.signMessage({ message });

    return Signature.from0xString(signature);
  }

  // public async validateSignature(signature: Buffer, message?: Buffer | undefined): Promise<boolean> {

  // }
}
