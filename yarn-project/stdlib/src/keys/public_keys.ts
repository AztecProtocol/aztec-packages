import { DEFAULT_IVPK_M_X, DEFAULT_IVPK_M_Y, DomainSeparator } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, withoutHexPrefix } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { type PublicKey, hashPublicKey } from './public_key.js';

/**
 * A non-owner's view of an account's master public keys.
 *
 * Per AZIP-8, only `ivpkM` is exposed as a point (since address derivation needs the curve
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
      Point.fromPlainObject(obj.ivpkM),
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
    // (Poseidon2 over [x, y]); passing the Point directly would inadvertently include
    // `is_infinite` and produce a different value.
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
    // Precomputed `hash_public_key(Point { DEFAULT_*_X, DEFAULT_*_Y, false })` for npk/ovpk/tpk.
    // Kept in sync with `Default for PublicKeys` in noir-protocol-circuits/crates/types/src/public_keys.nr.
    return new PublicKeys(
      Fr.fromString('0x14fbaeaeddaa69be81d404c684e78e9f1a786d225faf8de2ce97c92f67d89a26'),
      new Point(new Fr(DEFAULT_IVPK_M_X), new Fr(DEFAULT_IVPK_M_Y), false),
      Fr.fromString('0x0e60ed663a4da5636e2e25a1f1f0c5b27c011c8eaed22bbe61e2a0fd875dd24b'),
      Fr.fromString('0x082c6d164b0ba073c9dd911100248c8ecd80b03f82f38531856a3c16dadcbef0'),
    );
  }

  static async random(): Promise<PublicKeys> {
    const npkM = await Point.random();
    const ovpkM = await Point.random();
    const tpkM = await Point.random();
    return new PublicKeys(
      await hashPublicKey(npkM),
      await Point.random(),
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

  toBuffer(): Buffer {
    return serializeToBuffer([this.npkMHash, this.ivpkM, this.ovpkMHash, this.tpkMHash]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicKeys {
    const reader = BufferReader.asReader(buffer);
    const npkMHash = Fr.fromBuffer(reader);
    const ivpkM = reader.readObject(Point);
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
   * `[npk_m_hash, ivpk_m.x, ivpk_m.y, ivpk_m.is_infinite, ovpk_m_hash, tpk_m_hash]` (6 fields).
   *
   * The `is_infinite` slot is `0` for `ivpkM` produced by `deriveKeys` (fixed-base scalar
   * multiplication on Grumpkin cannot reach infinity for a non-zero scalar, and Poseidon-derived
   * scalars are non-zero with cryptographically negligible exception). External flows that
   * import pre-derived keys are responsible for maintaining this invariant (see the AZIP-8
   * migration note "Security note (PXE side)"). The slot stays on the wire because the Noir
   * struct's `Point` still carries the flag. AZIP-8's "drop `is_infinite`" goal applies to the
   * address-derivation hash (via `hash_public_key`, computed elsewhere), not to the
   * contract-call args wire.
   * TODO(F-553): drop the `is_infinite` slot once `Point` no longer carries the flag.
   */
  toFields(): Fr[] {
    return [
      this.npkMHash,
      this.ivpkM.x,
      this.ivpkM.y,
      new Fr(this.ivpkM.isInfinite ? 1 : 0),
      this.ovpkMHash,
      this.tpkMHash,
    ];
  }

  // Used in foundation/src/abi/encoder. Probably non-optimal but the encoder needs a refactor.
  encodeToNoir(): Fr[] {
    return this.toFields();
  }

  static fromFields(fields: Fr[] | FieldReader): PublicKeys {
    const reader = FieldReader.asReader(fields);
    const npkMHash = reader.readField();
    const ivpkMX = reader.readField();
    const ivpkMY = reader.readField();
    const ivpkMIsInfinite = reader.readBoolean();
    const ovpkMHash = reader.readField();
    const tpkMHash = reader.readField();
    return new PublicKeys(npkMHash, new Point(ivpkMX, ivpkMY, ivpkMIsInfinite), ovpkMHash, tpkMHash);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(keys: string) {
    return PublicKeys.fromBuffer(Buffer.from(withoutHexPrefix(keys), 'hex'));
  }
}
