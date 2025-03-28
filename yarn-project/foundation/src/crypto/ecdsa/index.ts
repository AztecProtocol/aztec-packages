import { BarretenbergSync } from '@aztec/bb.js';
import { numToInt32BE } from '@aztec/foundation/serialize';

import { concatenateUint8Arrays } from '../serialize.js';
import { EcdsaSignature } from './signature.js';

export * from './signature.js';

/**
 * ECDSA signature construction and helper operations.
 * TODO: Replace with codegen api on bb.js.
 */
export class Ecdsa {
  constructor(private curve: 'secp256k1' | 'secp256r1' = 'secp256k1') {}
  /**
   * Computes a secp256k1 public key from a private key.
   * @param privateKey - Secp256k1 private key.
   * @returns A secp256k1 public key.
   */
  public async computePublicKey(privateKey: Buffer): Promise<Buffer> {
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const [result] = api
      .getWasm()
      .callWasmExport(`ecdsa_${this.curve === 'secp256r1' ? 'r' : ''}_compute_public_key`, [privateKey], [64]);
    return Buffer.from(result);
  }

  /**
   * Constructs an ECDSA signature given a msg and a private key.
   * @param msg - Message over which the signature is constructed.
   * @param privateKey - The secp256k1 private key of the signer.
   * @returns An ECDSA signature of the form (r, s, v).
   */
  public async constructSignature(msg: Uint8Array, privateKey: Buffer) {
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const messageArray = concatenateUint8Arrays([numToInt32BE(msg.length), msg]);
    const [r, s, v] = api
      .getWasm()
      .callWasmExport(
        `ecdsa_${this.curve === 'secp256r1' ? 'r' : ''}_construct_signature_`,
        [messageArray, privateKey],
        [32, 32, 1],
      );
    return new EcdsaSignature(Buffer.from(r), Buffer.from(s), Buffer.from(v));
  }

  /**
   * Recovers a secp256k1 public key from an ECDSA signature (similar to ecrecover).
   * @param msg - Message over which the signature was constructed.
   * @param sig - The ECDSA signature.
   * @returns The secp256k1 public key of the signer.
   */
  public async recoverPublicKey(msg: Uint8Array, sig: EcdsaSignature): Promise<Buffer> {
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const messageArray = concatenateUint8Arrays([numToInt32BE(msg.length), msg]);
    const [result] = api
      .getWasm()
      .callWasmExport(
        `ecdsa_${this.curve === 'secp256r1' ? 'r' : ''}_recover_public_key_from_signature_`,
        [messageArray, sig.r, sig.s, sig.v],
        [64],
      );
    return Buffer.from(result);
  }

  /**
   * Verifies and ECDSA signature given a secp256k1 public key.
   * @param msg - Message over which the signature was constructed.
   * @param pubKey - The secp256k1 public key of the signer.
   * @param sig - The ECDSA signature.
   * @returns True or false.
   */
  public async verifySignature(msg: Uint8Array, pubKey: Buffer, sig: EcdsaSignature) {
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const messageArray = concatenateUint8Arrays([numToInt32BE(msg.length), msg]);
    const [result] = api
      .getWasm()
      .callWasmExport(
        `ecdsa_${this.curve === 'secp256r1' ? 'r' : ''}_verify_signature_`,
        [messageArray, pubKey, sig.r, sig.s, sig.v],
        [1],
      );
    return result[0] === 1;
  }
}
