import { BarretenbergSync } from '@aztec/bb.js';
import type { Fr } from '@aztec/foundation/curves/bn254';
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
   * Constructs a Schnorr signature over a 32-byte message field element.
   * @param msg - The message hash, as a grumpkin base field element.
   * @param privateKey - The private key of the signer.
   * @returns A Schnorr signature of the form (s, e).
   */
  public async constructSignature(msg: Fr, privateKey: GrumpkinScalar) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.schnorrConstructSignature({
      messageField: msg.toBuffer(),
      privateKey: privateKey.toBuffer(),
    });
    return new SchnorrSignature(Buffer.from([...response.s, ...response.e]));
  }

  /**
   * Verifies a Schnorr signature against a Grumpkin public key.
   * @param msg - The message hash, as a grumpkin base field element.
   * @param pubKey - The Grumpkin public key of the signer.
   * @param sig - The Schnorr signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Fr, pubKey: Point, sig: SchnorrSignature) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.schnorrVerifySignature({
      messageField: msg.toBuffer(),
      publicKey: { x: pubKey.x.toBuffer(), y: pubKey.y.toBuffer() },
      s: sig.s,
      e: sig.e,
    });
    return response.verified;
  }
}
