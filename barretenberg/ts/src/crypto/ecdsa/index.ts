/**
 * ECDSA signature operations using barretenberg bbapi.
 */

import { BarretenbergSync } from '../../barretenberg/index.js';
import { EcdsaSignature } from './signature.js';

export * from './signature.js';

/**
 * ECDSA signature construction and helper operations.
 */
export class Ecdsa {
  constructor(private curve: 'secp256k1' | 'secp256r1' = 'secp256k1') {}

  /**
   * Computes a secp256k1/secp256r1 public key from a private key.
   * @param privateKey - Private key.
   * @returns A public key (uncompressed, 64 bytes: x || y).
   */
  public async computePublicKey(privateKey: Buffer): Promise<Buffer> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response =
      this.curve === 'secp256r1'
        ? api.ecdsaSecp256r1ComputePublicKey({ privateKey })
        : api.ecdsaSecp256k1ComputePublicKey({ privateKey });
    return Buffer.concat([Buffer.from(response.publicKey.x), Buffer.from(response.publicKey.y)]);
  }

  /**
   * Constructs an ECDSA signature given a msg and a private key.
   * @param msg - Message over which the signature is constructed.
   * @param privateKey - The private key of the signer.
   * @returns An ECDSA signature of the form (r, s, v).
   */
  public async constructSignature(msg: Uint8Array, privateKey: Buffer) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response =
      this.curve === 'secp256r1'
        ? api.ecdsaSecp256r1ConstructSignature({ message: msg, privateKey })
        : api.ecdsaSecp256k1ConstructSignature({ message: msg, privateKey });
    return new EcdsaSignature(Buffer.from(response.r), Buffer.from(response.s), Buffer.from([response.v]));
  }

  /**
   * Recovers a public key from an ECDSA signature (similar to ecrecover).
   * @param msg - Message over which the signature was constructed.
   * @param sig - The ECDSA signature.
   * @returns The public key of the signer (uncompressed, 64 bytes).
   */
  public async recoverPublicKey(msg: Uint8Array, sig: EcdsaSignature): Promise<Buffer> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response =
      this.curve === 'secp256r1'
        ? api.ecdsaSecp256r1RecoverPublicKey({ message: msg, r: sig.r, s: sig.s, v: sig.v[0] })
        : api.ecdsaSecp256k1RecoverPublicKey({ message: msg, r: sig.r, s: sig.s, v: sig.v[0] });
    return Buffer.concat([Buffer.from(response.publicKey.x), Buffer.from(response.publicKey.y)]);
  }

  /**
   * Verifies an ECDSA signature given a public key.
   * @param msg - Message over which the signature was constructed.
   * @param pubKey - The public key of the signer (uncompressed, 64 bytes).
   * @param sig - The ECDSA signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Uint8Array, pubKey: Buffer, sig: EcdsaSignature) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response =
      this.curve === 'secp256r1'
        ? api.ecdsaSecp256r1VerifySignature({
            message: msg,
            publicKey: { x: pubKey.subarray(0, 32), y: pubKey.subarray(32, 64) },
            r: sig.r,
            s: sig.s,
            v: sig.v[0],
          })
        : api.ecdsaSecp256k1VerifySignature({
            message: msg,
            publicKey: { x: pubKey.subarray(0, 32), y: pubKey.subarray(32, 64) },
            r: sig.r,
            s: sig.s,
            v: sig.v[0],
          });
    return response.verified;
  }
}
