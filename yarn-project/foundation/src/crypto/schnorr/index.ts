import { BarretenbergSync } from '@aztec/bb.js';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { Point } from '@aztec/foundation/curves/grumpkin';

import { SchnorrSignature } from './signature.js';

export * from './signature.js';

/**
 * Schnorr signature construction and helper operations.
 */
export class Schnorr {
  /**
   * Computes a grumpkin public key from a private key.
   * @param privateKey - The private key.
   * @returns A grumpkin public key.
   */
  public async computePublicKey(privateKey: GrumpkinScalar): Promise<Point> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.schnorrComputePublicKey({ privateKey: privateKey.toBuffer() });
    return Point.fromBuffer(Buffer.concat([Buffer.from(response.publicKey.x), Buffer.from(response.publicKey.y)]));
  }

  /**
   * Constructs a Schnorr signature given a msg and a private key.
   * @param msg - Message over which the signature is constructed.
   * @param privateKey - The private key of the signer.
   * @returns A Schnorr signature of the form (s, e).
   */
  public async constructSignature(msg: Uint8Array, privateKey: GrumpkinScalar) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.schnorrConstructSignature({
      message: msg,
      privateKey: privateKey.toBuffer(),
    });
    return new SchnorrSignature(Buffer.from([...response.s, ...response.e]));
  }

  /**
   * Verifies a Schnorr signature given a Grumpkin public key.
   * @param msg - Message over which the signature was constructed.
   * @param pubKey - The Grumpkin public key of the signer.
   * @param sig - The Schnorr signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Uint8Array, pubKey: Point, sig: SchnorrSignature) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.schnorrVerifySignature({
      message: msg,
      publicKey: { x: pubKey.x.toBuffer(), y: pubKey.y.toBuffer() },
      s: sig.s,
      e: sig.e,
    });
    return response.verified;
  }
}
