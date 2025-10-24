/**
 * ECDSA signature operations - delegates to barretenberg/ts implementation.
 */
import { Ecdsa as EcdsaImpl, EcdsaSignature as EcdsaSignatureImpl } from '@aztec/bb.js/crypto/ecdsa';

import { EcdsaSignature } from './signature.js';

export * from './signature.js';

/**
 * ECDSA signature construction and helper operations.
 */
export class Ecdsa {
  private ecdsaImpl: EcdsaImpl;

  constructor(curve: 'secp256k1' | 'secp256r1' = 'secp256k1') {
    this.ecdsaImpl = new EcdsaImpl(curve);
  }

  /**
   * Computes a secp256k1/secp256r1 public key from a private key.
   * @param privateKey - Private key.
   * @returns A public key (uncompressed, 64 bytes).
   */
  public async computePublicKey(privateKey: Buffer): Promise<Buffer> {
    return await this.ecdsaImpl.computePublicKey(privateKey);
  }

  /**
   * Constructs an ECDSA signature given a msg and a private key.
   * @param msg - Message over which the signature is constructed.
   * @param privateKey - The private key of the signer.
   * @returns An ECDSA signature of the form (r, s, v).
   */
  public async constructSignature(msg: Uint8Array, privateKey: Buffer) {
    const result = await this.ecdsaImpl.constructSignature(msg, privateKey);
    return new EcdsaSignature(result.r, result.s, result.v);
  }

  /**
   * Recovers a public key from an ECDSA signature (similar to ecrecover).
   * @param msg - Message over which the signature was constructed.
   * @param sig - The ECDSA signature.
   * @returns The public key of the signer.
   */
  public async recoverPublicKey(msg: Uint8Array, sig: EcdsaSignature): Promise<Buffer> {
    const ecdsaSig = new EcdsaSignatureImpl(sig.r, sig.s, sig.v);
    return await this.ecdsaImpl.recoverPublicKey(msg, ecdsaSig);
  }

  /**
   * Verifies an ECDSA signature given a public key.
   * @param msg - Message over which the signature was constructed.
   * @param pubKey - The public key of the signer.
   * @param sig - The ECDSA signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Uint8Array, pubKey: Buffer, sig: EcdsaSignature) {
    const ecdsaSig = new EcdsaSignatureImpl(sig.r, sig.s, sig.v);
    return await this.ecdsaImpl.verifySignature(msg, pubKey, ecdsaSig);
  }
}
