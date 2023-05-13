import { Secp256k1 } from '@aztec/barretenberg.js/crypto';
import { EcdsaSignature } from '@aztec/barretenberg.js/crypto';
import { EthPublicKey, Secp256k1Fr } from '@aztec/foundation/eth-public-key';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';

/**
 * Represents a cryptographic public-private key pair on the secp256k1 curve.
 * Provides functionality to generate, access, and sign messages using the key pair.
 */
export interface Secp256k1KeyPair {
  getPublicKey(): EthPublicKey;
  getPrivateKey(): Promise<Buffer>;
  signMessage(message: Buffer): Promise<EcdsaSignature>;
  recoverSigningKey(message: Buffer, signature: EcdsaSignature): Promise<EthPublicKey>;
}

/**
 * The ConstantSecp256k1KeyPair class is an implementation of the KeyPair interface, which allows generation and
 * management of a constant public and private key pair. It provides methods for creating a random
 * instance of the key pair, retrieving the public key, getting the private key, and signing messages
 * securely using the ECDSA signature algorithm. This class ensures the persistence and consistency
 * of the generated keys, making it suitable for cryptographic operations where constant key pairs are required.
 */
export class ConstantSecp256k1KeyPair implements Secp256k1KeyPair {
  /**
   * Generate a random ConstantSecp256k1KeyPair instance on a Grumpkin curve.
   * The random private key is generated using 32 random bytes, and the corresponding public key is calculated
   * by multiplying the Grumpkin generator point with the private key. This function provides an efficient
   * way of generating unique key pairs for cryptographic purposes.
   *
   * @param secp256k1 - The secp256k1 curve used for elliptic curve cryptography.
   * @param ecdsa - The ecdsa instance to create and verify ECDSA signatures.
   * @returns A randomly generated ConstantSecp256k1KeyPair instance.
   */
  public static random(secp256k1: Secp256k1, ecdsa: Ecdsa) {
    const privateKey = Secp256k1Fr.random().toBuffer();
    const publicKey = EthPublicKey.fromBuffer(secp256k1.mul(Secp256k1.generator, privateKey));
    return new ConstantSecp256k1KeyPair(ecdsa, publicKey, privateKey);
  }

  constructor(private ecdsa: Ecdsa, private publicKey: EthPublicKey, private privateKey: Buffer) {}

  /**
   * Retrieve the public key from the Secp256k1KeyPair instance.
   * The returned public key is an EthPublicKey object which represents a point on the secp256k1 curve.
   *
   * @returns The public key as an elliptic curve point on secp256k1 curve.
   */
  public getPublicKey() {
    return this.publicKey;
  }

  /**
   * Retrieves the private key of the Secp256k1KeyPair instance.
   * The function returns a Promise that resolves to a Buffer containing the private key.
   *
   * @returns A Promise that resolves to a Buffer containing the private key.
   */
  public getPrivateKey() {
    return Promise.resolve(this.privateKey);
  }

  /**
   * Sign a given message using the private key of the key pair.
   * The input 'message' should be a non-empty Buffer containing the data to be signed.
   * Throws an error if the input message is empty.
   *
   * @param message - The Buffer containing the data to be signed.
   * @returns A Promise that resolves to an EcdsaSignature instance representing the signature.
   */
  public signMessage(message: Buffer) {
    if (!message.length) {
      throw new Error('Cannot sign over empty message.');
    }

    return Promise.resolve(this.ecdsa.constructSignature(message, this.privateKey));
  }

  /**
   * Recover the signing public key from an ECDSA signature.
   * The input 'message' should be a non-empty Buffer containing the data to be signed.
   * Throws an error if the input message is empty.
   *
   * @param message - The Buffer containing the data to be signed.
   * @param signature - The ECDSA signature created by signing `message`.
   * @returns A Promise that resolves to an EcdsaSignature instance representing the signature.
   */
  public recoverSigningKey(message: Buffer, signature: EcdsaSignature) {
    if (!message.length) {
      throw new Error('Cannot recover signing key from an empty message.');
    }

    return Promise.resolve(EthPublicKey.fromBuffer(this.ecdsa.recoverPublicKey(message, signature)));
  }
}
