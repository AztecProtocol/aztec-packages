import { PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { ValidatorKeyStore } from './index.js';

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

  // TODO(md): see if this is better to not just be a message string in the end
  // This is just inefficient
  public async sign(messageBuffer: Buffer): Promise<Buffer> {
    const message = `0x${messageBuffer.toString('hex')}`;
    const sigString = await this.signer.signMessage({ message });

    return Buffer.from(sigString.slice(2), 'hex');
  }

  // public async validateSignature(signature: Buffer, message?: Buffer | undefined): Promise<boolean> {

  // }
}
