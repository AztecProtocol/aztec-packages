import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, withoutHexPrefix } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import {
  DEFAULT_IVPK_M_X,
  DEFAULT_IVPK_M_Y,
  DEFAULT_NPK_M_X,
  DEFAULT_NPK_M_Y,
  DEFAULT_OVPK_M_X,
  DEFAULT_OVPK_M_Y,
  DEFAULT_TPK_M_X,
  DEFAULT_TPK_M_Y,
  GeneratorIndex,
} from '../constants.gen.js';
import { type PublicKey } from './public_key.js';

export class PublicKeys {
  public constructor(
    /** Master nullifier public key */
    public masterNullifierPublicKey: PublicKey,
    /** Master incoming viewing public key */
    public masterIncomingViewingPublicKey: PublicKey,
    /** Master outgoing viewing public key */
    public masterOutgoingViewingPublicKey: PublicKey,
    /** Master tagging viewing public key */
    public masterTaggingPublicKey: PublicKey,
  ) {}

  static get schema() {
    return z
      .object({
        masterNullifierPublicKey: schemas.Point,
        masterIncomingViewingPublicKey: schemas.Point,
        masterOutgoingViewingPublicKey: schemas.Point,
        masterTaggingPublicKey: schemas.Point,
      })
      .transform(PublicKeys.from);
  }

  static from(fields: FieldsOf<PublicKeys>) {
    return new PublicKeys(
      fields.masterNullifierPublicKey,
      fields.masterIncomingViewingPublicKey,
      fields.masterOutgoingViewingPublicKey,
      fields.masterTaggingPublicKey,
    );
  }

  hash() {
    return this.isEmpty()
      ? Fr.ZERO
      : poseidon2HashWithSeparator(
          [
            this.masterNullifierPublicKey,
            this.masterIncomingViewingPublicKey,
            this.masterOutgoingViewingPublicKey,
            this.masterTaggingPublicKey,
          ],
          GeneratorIndex.PUBLIC_KEYS_HASH,
        );
  }

  isEmpty() {
    return (
      this.masterNullifierPublicKey.isZero() &&
      this.masterIncomingViewingPublicKey.isZero() &&
      this.masterOutgoingViewingPublicKey.isZero() &&
      this.masterTaggingPublicKey.isZero()
    );
  }

  static default(): PublicKeys {
    return new PublicKeys(
      new Point(new Fr(DEFAULT_NPK_M_X), new Fr(DEFAULT_NPK_M_Y), false),
      new Point(new Fr(DEFAULT_IVPK_M_X), new Fr(DEFAULT_IVPK_M_Y), false),
      new Point(new Fr(DEFAULT_OVPK_M_X), new Fr(DEFAULT_OVPK_M_Y), false),
      new Point(new Fr(DEFAULT_TPK_M_X), new Fr(DEFAULT_TPK_M_Y), false),
    );
  }

  static async random(): Promise<PublicKeys> {
    return new PublicKeys(await Point.random(), await Point.random(), await Point.random(), await Point.random());
  }

  /**
   * Determines if this PublicKeys instance is equal to the given PublicKeys instance.
   * Equality is based on the content of their respective buffers.
   *
   * @param other - The PublicKeys instance to compare against.
   * @returns True if the buffers of both instances are equal, false otherwise.
   */
  equals(other: PublicKeys): boolean {
    return (
      this.masterNullifierPublicKey.equals(other.masterNullifierPublicKey) &&
      this.masterIncomingViewingPublicKey.equals(other.masterIncomingViewingPublicKey) &&
      this.masterOutgoingViewingPublicKey.equals(other.masterOutgoingViewingPublicKey) &&
      this.masterTaggingPublicKey.equals(other.masterTaggingPublicKey)
    );
  }

  /**
   * Converts the PublicKeys instance into a Buffer.
   * This method should be used when encoding the address for storage, transmission or serialization purposes.
   *
   * @returns A Buffer representation of the PublicKeys instance.
   */
  toBuffer(): Buffer {
    return serializeToBuffer([
      this.masterNullifierPublicKey,
      this.masterIncomingViewingPublicKey,
      this.masterOutgoingViewingPublicKey,
      this.masterTaggingPublicKey,
    ]);
  }

  /**
   * Creates an PublicKeys instance from a given buffer or BufferReader.
   * If the input is a Buffer, it wraps it in a BufferReader before processing.
   * Throws an error if the input length is not equal to the expected size.
   *
   * @param buffer - The input buffer or BufferReader containing the address data.
   * @returns - A new PublicKeys instance with the extracted address data.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicKeys {
    const reader = BufferReader.asReader(buffer);
    const masterNullifierPublicKey = reader.readObject(Point);
    const masterIncomingViewingPublicKey = reader.readObject(Point);
    const masterOutgoingViewingPublicKey = reader.readObject(Point);
    const masterTaggingPublicKey = reader.readObject(Point);
    return new PublicKeys(
      masterNullifierPublicKey,
      masterIncomingViewingPublicKey,
      masterOutgoingViewingPublicKey,
      masterTaggingPublicKey,
    );
  }

  toNoirStruct() {
    // We need to use lowercase identifiers as those are what the noir interface expects
    // eslint-disable-next-line camelcase
    return {
      // TODO(#6337): Directly dump account.publicKeys here
      /* eslint-disable camelcase */
      npk_m: this.masterNullifierPublicKey.toWrappedNoirStruct(),
      ivpk_m: this.masterIncomingViewingPublicKey.toWrappedNoirStruct(),
      ovpk_m: this.masterOutgoingViewingPublicKey.toWrappedNoirStruct(),
      tpk_m: this.masterTaggingPublicKey.toWrappedNoirStruct(),
      /* eslint-enable camelcase */
    };
  }

  /**
   * Serializes the payload to an array of fields
   * @returns The fields of the payload
   */
  toFields(): Fr[] {
    return [
      ...this.masterNullifierPublicKey.toFields(),
      ...this.masterIncomingViewingPublicKey.toFields(),
      ...this.masterOutgoingViewingPublicKey.toFields(),
      ...this.masterTaggingPublicKey.toFields(),
    ];
  }

  // TOOD: This is used in foundation/src/abi/encoder. This is probably non-optimal but I did not want
  // to spend too much time on the encoder now. It probably needs a refactor.
  encodeToNoir(): Fr[] {
    return this.toFields();
  }

  static fromFields(fields: Fr[] | FieldReader): PublicKeys {
    const reader = FieldReader.asReader(fields);
    return new PublicKeys(
      reader.readObject(Point),
      reader.readObject(Point),
      reader.readObject(Point),
      reader.readObject(Point),
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(keys: string) {
    return PublicKeys.fromBuffer(Buffer.from(withoutHexPrefix(keys), 'hex'));
  }
}
