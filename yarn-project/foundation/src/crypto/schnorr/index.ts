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
    const [result] = api.getWasm().callWasmExport('schnorr_compute_public_key', [privateKey.toBuffer()], [64]);
    return Point.fromBuffer(Buffer.from(result));
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
    const [s, e] = api
      .getWasm()
      .callWasmExport('schnorr_construct_signature', [messageArray, privateKey.toBuffer()], [32, 32]);
    return new SchnorrSignature(Buffer.from([...s, ...e]));
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
    const [result] = api
      .getWasm()
      .callWasmExport('schnorr_verify_signature', [messageArray, pubKey.toBuffer(), sig.s, sig.e], [1]);
    return result[0] === 1;
  }
}
