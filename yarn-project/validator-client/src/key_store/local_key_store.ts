import { PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { ValidatorKeyStore } from './index.js';
import {Signature} from "@aztec/circuit-types";
import { parseSignature } from 'viem';

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
  public async sign(messageBuffer: Buffer): Promise<Signature> {
    const message = `0x${messageBuffer.toString('hex')}`;
    const signature = await this.signer.signMessage({ message });
    const {r,s,v} = parseSignature(signature as `0x{string}`);

    const rBuffer = Buffer.from(r.slice(2), 'hex');
    const sBuffer = Buffer.from(s.slice(2), 'hex');

    return new Signature(rBuffer, sBuffer, v ? Number(v) : 0);
  }

  // public async validateSignature(signature: Buffer, message?: Buffer | undefined): Promise<boolean> {

  // }
}
