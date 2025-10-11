import { BarretenbergSync } from '@aztec/bb.js';
import { type GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { numToInt32BE } from '@aztec/foundation/serialize';

import { concatenateUint8Arrays } from '../serialize.js';
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
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
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
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const messageArray = concatenateUint8Arrays([numToInt32BE(msg.length), msg]);
    const response = api.schnorrConstructSignature({
      message: messageArray,
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
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const messageArray = concatenateUint8Arrays([numToInt32BE(msg.length), msg]);
    const response = api.schnorrVerifySignature({
      message: messageArray,
      publicKey: { x: pubKey.x.toBuffer(), y: pubKey.y.toBuffer() },
      s: sig.s,
      e: sig.e,
    });
    return response.verified;
  }
}
