import {
  DEFAULT_IVPK_M_X,
  DEFAULT_IVPK_M_Y,
  DEFAULT_NPK_M_HASH,
  DEFAULT_OVPK_M_HASH,
  DEFAULT_TPK_M_HASH,
  DomainSeparator,
} from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, withoutHexPrefix } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { PublicKey, hashPublicKey } from './public_key.js';

/**
 * A non-owner's view of an account's master public keys.
 *
 * Only `ivpkM` is exposed as a point (since address derivation needs the curve
 * point in-circuit); the other three keys are exposed as their `hashPublicKey` digests.
 */
export class PublicKeys {
  public constructor(
    /** Hash of the master nullifier public key */
    public npkMHash: Fr,
    /** Master incoming viewing public key */
    public ivpkM: PublicKey,
    /** Hash of the master outgoing viewing public key */
    public ovpkMHash: Fr,
    /** Hash of the master tagging public key */
    public tpkMHash: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        npkMHash: schemas.Fr,
        ivpkM: schemas.Point,
        ovpkMHash: schemas.Fr,
        tpkMHash: schemas.Fr,
      })
      .transform(PublicKeys.from);
  }

  static from(fields: FieldsOf<PublicKeys>) {
    return new PublicKeys(fields.npkMHash, fields.ivpkM, fields.ovpkMHash, fields.tpkMHash);
  }

  /**
   * Creates a PublicKeys from a plain object without Zod validation.
   * Suitable for deserializing trusted data (e.g., from C++ via MessagePack).
   */
  static fromPlainObject(obj: any): PublicKeys {
    if (obj instanceof PublicKeys) {
      return obj;
    }
    return new PublicKeys(
      Fr.fromPlainObject(obj.npkMHash),
      PublicKey.fromPlainObject(obj.ivpkM),
      Fr.fromPlainObject(obj.ovpkMHash),
      Fr.fromPlainObject(obj.tpkMHash),
    );
  }

  async hash() {
    if (this.isEmpty()) {
      return Fr.ZERO;
    }
    // Mirror Noir's `PublicKeys::hash`: hash the four single-key digests under
    // DOM_SEP__PUBLIC_KEYS_HASH. `ivpk_m` must be reduced to its single-key digest first
    // (Poseidon2 over [x, y]); passing the Point directly would omit the DOM_SEP__SINGLE_PUBLIC_KEY_HASH
    const ivpkMHash = await hashPublicKey(this.ivpkM);
    return poseidon2HashWithSeparator(
      [this.npkMHash, ivpkMHash, this.ovpkMHash, this.tpkMHash],
      DomainSeparator.PUBLIC_KEYS_HASH,
    );
  }

  isEmpty() {
    return this.npkMHash.isZero() && this.ivpkM.isZero() && this.ovpkMHash.isZero() && this.tpkMHash.isZero();
  }

  static default(): PublicKeys {
    // Precomputed `hash_public_key(Point { DEFAULT_*_X, DEFAULT_*_Y })` for npk/ovpk/tpk.
    // Sourced from constants.gen.ts (originally defined in
    // noir-protocol-circuits/crates/types/src/constants.nr); a self-test in public_keys.nr
    // (`default_hashes_match_default_points`) catches drift between the *_HASH constants and
    // the underlying X/Y points.
    return new PublicKeys(
      new Fr(DEFAULT_NPK_M_HASH),
      new PublicKey(new Fr(DEFAULT_IVPK_M_X), new Fr(DEFAULT_IVPK_M_Y)),
      new Fr(DEFAULT_OVPK_M_HASH),
      new Fr(DEFAULT_TPK_M_HASH),
    );
  }

  static async random(): Promise<PublicKeys> {
    const npkM = await PublicKey.random();
    const ovpkM = await PublicKey.random();
    const tpkM = await PublicKey.random();
    return new PublicKeys(
      await hashPublicKey(npkM),
      await PublicKey.random(),
      await hashPublicKey(ovpkM),
      await hashPublicKey(tpkM),
    );
  }

  equals(other: PublicKeys): boolean {
    return (
      this.npkMHash.equals(other.npkMHash) &&
      this.ivpkM.equals(other.ivpkM) &&
      this.ovpkMHash.equals(other.ovpkMHash) &&
      this.tpkMHash.equals(other.tpkMHash)
    );
  }

  /**
   * Converts the PublicKeys instance into a Buffer.
   * This method should be used when encoding the address for storage, transmission or serialization purposes.
   *
   * @returns A Buffer representation of the PublicKeys instance.
   */
  toBuffer(): Buffer {
    return serializeToBuffer([this.npkMHash, this.ivpkM, this.ovpkMHash, this.tpkMHash]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicKeys {
    const reader = BufferReader.asReader(buffer);
    const npkMHash = Fr.fromBuffer(reader);
    const ivpkM = reader.readObject(PublicKey);
    const ovpkMHash = Fr.fromBuffer(reader);
    const tpkMHash = Fr.fromBuffer(reader);
    return new PublicKeys(npkMHash, ivpkM, ovpkMHash, tpkMHash);
  }

  toNoirStruct() {
    // We need to use lowercase identifiers as those are what the noir interface expects.
    /* eslint-disable camelcase */
    return {
      npk_m_hash: this.npkMHash,
      ivpk_m: this.ivpkM.toWrappedNoirStruct(),
      ovpk_m_hash: this.ovpkMHash,
      tpk_m_hash: this.tpkMHash,
    };
    /* eslint-enable camelcase */
  }

  /**
   * Wire-format fields matching Noir's struct flattening of `PublicKeys`:
   * `[npk_m_hash, ivpk_m.x, ivpk_m.y, ovpk_m_hash, tpk_m_hash]` (5 fields).
   */
  toFields(): Fr[] {
    return [this.npkMHash, this.ivpkM.x, this.ivpkM.y, this.ovpkMHash, this.tpkMHash];
  }

  // Used in foundation/src/abi/encoder. Probably non-optimal but the encoder needs a refactor.
  encodeToNoir(): Fr[] {
    return this.toFields();
  }

  static fromFields(fields: Fr[] | FieldReader): PublicKeys {
    const reader = FieldReader.asReader(fields);
    return new PublicKeys(reader.readField(), reader.readObject(PublicKey), reader.readField(), reader.readField());
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(keys: string) {
    return PublicKeys.fromBuffer(Buffer.from(withoutHexPrefix(keys), 'hex'));
  }
}
