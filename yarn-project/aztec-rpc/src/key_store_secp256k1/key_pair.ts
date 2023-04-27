import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { EcdsaSignature } from '@aztec/circuits.js';
import { EthPublicKey } from '@aztec/foundation';
import { randomBytes } from '../foundation.js';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';

export interface Secp256k1KeyPair {
  getPublicKey(): EthPublicKey;
  getPrivateKey(): Promise<Buffer>;
  signMessage(message: Buffer): Promise<EcdsaSignature>;
}

export class ConstantSecp256k1KeyPair implements Secp256k1KeyPair {
  public static random(secp256k1: Secp256k1, ecdsa: Ecdsa) {
    const privateKey = randomBytes(32);
    const publicKey = EthPublicKey.fromBuffer(secp256k1.mul(Secp256k1.generator, privateKey));
    return new ConstantSecp256k1KeyPair(ecdsa, publicKey, privateKey);
  }

  constructor(private ecdsa: Ecdsa, private publicKey: EthPublicKey, private privateKey: Buffer) {}

  public getPublicKey() {
    return this.publicKey;
  }

  public getPrivateKey() {
    return Promise.resolve(this.privateKey);
  }

  public signMessage(message: Buffer) {
    if (!message.length) {
      throw new Error('Cannot sign over empty message.');
    }

    return Promise.resolve(this.ecdsa.constructSignature(message, this.privateKey));
  }
}
