import { MAX_BLOCK_NUMBER_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { UInt32 } from '../types/index.js';

/**
 * Maximum block number.
 */
export class IncludeByTimestamp {
  constructor(
    /**
     * Whether a max block number was requested.
     */
    public isSome: boolean,
    /**
     * The requested max block number, if isSome is true.
     */
    public value: UInt32,
  ) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(...IncludeByTimestamp.getFields(this));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...IncludeByTimestamp.getFields(this));
    if (fields.length !== MAX_BLOCK_NUMBER_LENGTH) {
      throw new Error(
        `Invalid number of fields for IncludeByTimestamp. Expected ${MAX_BLOCK_NUMBER_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  /**
   * Deserializes IncludeByTimestamp from a buffer or reader.
   * @param buffer - Buffer to read from.
   * @returns The IncludeByTimestamp.
   */
  static fromBuffer(buffer: Buffer | BufferReader): IncludeByTimestamp {
    const reader = BufferReader.asReader(buffer);
    return new IncludeByTimestamp(reader.readBoolean(), reader.readNumber());
  }

  static fromFields(fields: Fr[] | FieldReader): IncludeByTimestamp {
    const reader = FieldReader.asReader(fields);
    return new IncludeByTimestamp(reader.readBoolean(), reader.readU32());
  }

  static empty() {
    return new IncludeByTimestamp(false, 0);
  }

  isEmpty(): boolean {
    return !this.isSome && this.value === 0;
  }

  /**
   * Create a new instance from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A new instance.
   */
  static from(fields: FieldsOf<IncludeByTimestamp>): IncludeByTimestamp {
    return new IncludeByTimestamp(...IncludeByTimestamp.getFields(fields));
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<IncludeByTimestamp>) {
    return [fields.isSome, fields.value] as const;
  }
}
