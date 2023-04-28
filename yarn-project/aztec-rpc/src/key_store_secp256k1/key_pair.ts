import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { EcdsaSignature } from '@aztec/circuits.js';
import { EthPublicKey, Secp256k1Fr } from '@aztec/foundation';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';

export interface KeyPair {
  getPublicKey(): EthPublicKey;
  getPrivateKey(): Promise<Buffer>;
  signMessage(message: Buffer): Promise<EcdsaSignature>;
}

export class ConstantKeyPair implements KeyPair {
  public static random(secp256k1: Secp256k1, ecdsa: Ecdsa) {
    const privateKey = Secp256k1Fr.random().toBuffer();
    const publicKey = EthPublicKey.fromBuffer(secp256k1.mul(Secp256k1.generator, privateKey));
    return new ConstantKeyPair(ecdsa, publicKey, privateKey);
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
