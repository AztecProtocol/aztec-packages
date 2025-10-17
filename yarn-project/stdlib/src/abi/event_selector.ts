import { fromHex, toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { poseidon2HashBytes, randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader } from '@aztec/foundation/serialize';

import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/**
 * Event selector branding.
 * @remarks Provides nominal typing to prevent accidental type confusion with other selectors.
 */
export interface EventSelector {
  /** Brand. */
  _branding: 'EventSelector';
}

/**
 * An event selector uniquely identifies an event type within a contract.
 *
 * Event selectors are 4-byte identifiers computed by hashing the event signature
 * using Poseidon2. They are used for:
 * - Identifying emitted events in transaction logs
 * - Filtering events by type
 * - Efficient event indexing and querying
 *
 * @remarks
 * Event selectors use the same hashing and encoding as function selectors,
 * but are kept as a separate type to prevent confusion. Events are emitted
 * from both private and public functions and can be encrypted or unencrypted.
 *
 * @example
 * ```typescript
 * // Create from signature
 * const selector = await EventSelector.fromSignature('Transfer(field,field,field)');
 *
 * // Deserialize from logs
 * const selector = EventSelector.fromString('0xabcd1234');
 * const selector = EventSelector.fromField(fieldFromCircuit);
 * ```
 */
export class EventSelector extends Selector {
  /**
   * Deserializes an event selector from a buffer or reader.
   * @param buffer - Buffer or BufferReader containing the 4-byte selector
   * @returns The deserialized EventSelector instance
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    return new EventSelector(value);
  }

  /**
   * Converts a field element to an event selector.
   * @param fr - The field element to convert
   * @returns The event selector
   * @remarks Useful when extracting selectors from event logs
   */
  static fromField(fr: Fr) {
    return new EventSelector(Number(fr.toBigInt()));
  }

  /**
   * Creates an event selector from an event signature string.
   *
   * @param signature - Event signature (e.g., "Transfer(field,field,field)")
   * @returns The computed event selector
   * @throws If the signature contains whitespace
   *
   * @remarks
   * Event signatures follow the same format as function signatures:
   * - Use Noir type names
   * - No spaces between parameters
   * - Type information only, no parameter names
   *
   * @example
   * ```typescript
   * const selector = await EventSelector.fromSignature('Transfer(field,field,field)');
   * const selector = await EventSelector.fromSignature('NoteCreated(field,[u8;32])');
   * ```
   */
  static async fromSignature(signature: string) {
    // throw if signature contains whitespace
    if (/\s/.test(signature)) {
      throw new Error('Signature cannot contain whitespace');
    }
    const hash = await poseidon2HashBytes(Buffer.from(signature));
    // We take the last Selector.SIZE big endian bytes
    const bytes = hash.toBuffer().slice(-Selector.SIZE);
    return EventSelector.fromBuffer(bytes);
  }

  /**
   * Creates an event selector from a hex-encoded string.
   *
   * @param selector - The hex-encoded string (with or without 0x prefix)
   * @returns The EventSelector instance
   * @throws If the hex string is not exactly 4 bytes
   */
  static fromString(selector: string) {
    const buf = fromHex(selector);
    if (buf.length !== Selector.SIZE) {
      throw new Error(`Invalid EventSelector length ${buf.length} (expected ${Selector.SIZE}).`);
    }
    return EventSelector.fromBuffer(buf);
  }

  /**
   * Creates an empty (zero) event selector.
   * @returns A selector with value 0
   */
  static empty() {
    return new EventSelector(0);
  }

  /**
   * Creates a random event selector.
   * @returns A selector with a random 4-byte value
   * @remarks Useful for testing
   */
  static random() {
    return EventSelector.fromBuffer(randomBytes(Selector.SIZE));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return hexSchemaFor(EventSelector);
  }
}
