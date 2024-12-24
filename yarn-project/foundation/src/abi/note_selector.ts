import { toBigIntBE } from '../bigint-buffer/index.js';
import { randomInt } from '../crypto/index.js';
import { Fr } from '../fields/fields.js';
import { hexSchemaFor } from '../schemas/utils.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { TypeRegistry } from '../serialize/type_registry.js';
import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/** Note selector branding */
export interface NoteSelector {
  /** Brand. */
  _branding: 'NoteSelector';
}

/**
 * A note selector is a 7 bit long value that identifies a note type within a contract.
 * TODO(#10952): Encoding of note type id can be reduced to 7 bits.
 */
export class NoteSelector extends Selector {
  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer  or BufferReader to read from.
   * @returns The Selector.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    if (value >= 1 << 7) {
      throw new Error('Invalid note selector');
    }
    return new NoteSelector(value);
  }

  static fromString(buf: string) {
    const withoutPrefix = buf.replace(/^0x/i, '').slice(-8);
    const buffer = Buffer.from(withoutPrefix, 'hex');
    return NoteSelector.fromBuffer(buffer);
  }

  /**
   * Converts a field to selector.
   * @param fr - The field to convert.
   * @returns The selector.
   */
  static fromField(fr: Fr) {
    return new NoteSelector(Number(fr.toBigInt()));
  }

  /**
   * Creates an empty selector.
   * @returns An empty selector.
   */
  static empty() {
    return new NoteSelector(0);
  }

  /**
   * Creates a random selector.
   * @returns A random selector.
   */
  static random() {
    const value = randomInt(1 << 7);
    return NoteSelector.fromField(new Fr(value));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return hexSchemaFor(NoteSelector);
  }
}

// For deserializing JSON.
TypeRegistry.register('NoteSelector', NoteSelector);
