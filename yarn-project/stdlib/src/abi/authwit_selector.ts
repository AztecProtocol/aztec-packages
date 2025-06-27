import { fromHex, toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { poseidon2HashBytes, randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';

import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/** Authwit selector branding */
export interface AuthwitSelector {
  /** Brand. */
  _branding: 'AuthwitSelector';
}

/** An authwit selector is the first 4 bytes of the hash of an authwit signature. */
export class AuthwitSelector extends Selector {
  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer  or BufferReader to read from.
   * @returns The Selector.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    return new AuthwitSelector(value);
  }

  /**
   * Converts a field to selector.
   * @param fr - The field to convert.
   * @returns The selector.
   */
  static fromField(fr: Fr) {
    return new AuthwitSelector(Number(fr.toBigInt()));
  }

  /**
   * Creates a selector from a signature.
   * @param signature - Signature to generate the selector for (e.g. "transfer(field,field)").
   * @returns selector.
   */
  static async fromSignature(signature: string) {
    // throw if signature contains whitespace
    if (/\s/.test(signature)) {
      throw new Error('Signature cannot contain whitespace');
    }
    const hash = await poseidon2HashBytes(Buffer.from(signature));
    // We take the last Selector.SIZE big endian bytes
    const bytes = hash.toBuffer().slice(-Selector.SIZE);
    return AuthwitSelector.fromBuffer(bytes);
  }

  /**
   * Create a Selector instance from a hex-encoded string.
   *
   * @param selector - The hex-encoded string representing the Selector.
   * @returns An Selector instance.
   * @throws If the selector length is invalid.
   */
  static fromString(selector: string) {
    const buf = fromHex(selector);
    if (buf.length !== Selector.SIZE) {
      throw new Error(`Invalid AuthwitSelector length ${buf.length} (expected ${Selector.SIZE}).`);
    }
    return AuthwitSelector.fromBuffer(buf);
  }

  /**
   * Creates an empty selector.
   * @returns An empty selector.
   */
  static empty() {
    return new AuthwitSelector(0);
  }

  /**
   * Creates a random selector.
   * @returns A random selector.
   */
  static random() {
    return AuthwitSelector.fromBuffer(randomBytes(Selector.SIZE));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return hexSchemaFor(AuthwitSelector);
  }
}
