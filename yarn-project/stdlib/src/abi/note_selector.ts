import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, TypeRegistry } from '@aztec/foundation/serialize';

import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/**
 * Note selector branding.
 * @remarks Provides nominal typing to prevent accidental type confusion with other selectors.
 */
export interface NoteSelector {
  /** Brand. */
  _branding: 'NoteSelector';
}

/**
 * A note selector uniquely identifies a note type within a contract.
 *
 * Note selectors are compact identifiers (currently 7-bit values) used to distinguish
 * different types of notes within a single contract. They are used for:
 * - Identifying note types in the note hash tree
 * - Routing note processing to the correct deserialization logic
 * - Filtering notes by type during note discovery
 *
 * @remarks
 * Unlike function and event selectors which are 4 bytes, note selectors are constrained
 * to 7 bits (0-127) to optimize circuit constraints. The smaller size is acceptable
 * because note types are scoped per contract, not globally.
 *
 * TODO(#10952): The encoding can be further optimized to reduce to exactly 7 bits.
 *
 * @example
 * ```typescript
 * // Create a note selector
 * const selector = NoteSelector.fromField(new Fr(42));
 * const selector = NoteSelector.fromString('0x0000002a');
 *
 * // Random selector for testing
 * const randomSelector = NoteSelector.random(); // 0-127
 * ```
 */
export class NoteSelector extends Selector {
  /**
   * Deserializes a note selector from a buffer or reader.
   * @param buffer - Buffer or BufferReader containing the selector
   * @returns The deserialized NoteSelector instance
   * @throws If the value exceeds 127 (7-bit maximum)
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    if (value >= 1 << 7) {
      throw new Error(`Invalid note selector: ${value}`);
    }
    return new NoteSelector(value);
  }

  /**
   * Creates a note selector from a hex-encoded string.
   * @param buf - The hex-encoded string (with or without 0x prefix)
   * @returns The NoteSelector instance
   * @throws If the resulting value exceeds 127
   * @remarks Takes the last 8 hex characters (4 bytes) from the input
   */
  static fromString(buf: string) {
    const withoutPrefix = buf.replace(/^0x/i, '').slice(-8);
    const buffer = Buffer.from(withoutPrefix, 'hex');
    return NoteSelector.fromBuffer(buffer);
  }

  /**
   * Converts a field element to a note selector.
   * @param fr - The field element to convert
   * @returns The note selector
   * @remarks Useful when extracting selectors from note hashes
   */
  static fromField(fr: Fr) {
    return new NoteSelector(Number(fr.toBigInt()));
  }

  /**
   * Creates an empty (zero) note selector.
   * @returns A selector with value 0
   */
  static empty() {
    return new NoteSelector(0);
  }

  /**
   * Creates a random note selector.
   * @returns A selector with a random value from 0 to 127
   * @remarks Respects the 7-bit constraint for note selectors
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
