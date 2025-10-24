/**
 * Schnorr signature operations - delegates to barretenberg/ts implementation.
 * This wrapper maintains the foundation API using Fr and Point types.
 */
import { Schnorr as SchnorrImpl } from '@aztec/bb.js/crypto/schnorr';
import { SchnorrSignature as SchnorrSignatureImpl } from '@aztec/bb.js/crypto/schnorr';
import { Bn254Fr } from '@aztec/bb.js/types/fields';
import { GrumpkinPoint } from '@aztec/bb.js/types/points';
import { type GrumpkinScalar, Point } from '@aztec/foundation/fields';

import { SchnorrSignature } from './signature.js';

export * from './signature.js';

const schnorrImpl = new SchnorrImpl();

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
    const bn254Fr = Bn254Fr.fromBuffer(privateKey.toBuffer());
    const result = await schnorrImpl.computePublicKey(bn254Fr);
    return Point.fromBuffer(result.toBuffer());
  }

  /**
   * Constructs a Schnorr signature given a msg and a private key.
   * @param msg - Message over which the signature is constructed.
   * @param privateKey - The private key of the signer.
   * @returns A Schnorr signature of the form (s, e).
   */
  public async constructSignature(msg: Uint8Array, privateKey: GrumpkinScalar) {
    const bn254Fr = Bn254Fr.fromBuffer(privateKey.toBuffer());
    const result = await schnorrImpl.constructSignature(msg, bn254Fr);
    return new SchnorrSignature(result.toBuffer());
  }

  /**
   * Verifies a Schnorr signature given a Grumpkin public key.
   * @param msg - Message over which the signature was constructed.
   * @param pubKey - The Grumpkin public key of the signer.
   * @param sig - The Schnorr signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Uint8Array, pubKey: Point, sig: SchnorrSignature) {
    const grumpkinPoint = GrumpkinPoint.fromBuffer(pubKey.toBuffer());
    const schnorrSig = SchnorrSignatureImpl.fromBuffer(sig.toBuffer());
    return await schnorrImpl.verifySignature(msg, grumpkinPoint, schnorrSig);
  }
}
