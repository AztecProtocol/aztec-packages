import { MAX_BLOCK_NUMBER_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { UInt32 } from '../types/index.js';

/**
 * Maximum block number.
 */
export class MaxBlockNumber {
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
    return serializeToBuffer(...MaxBlockNumber.getFields(this));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...MaxBlockNumber.getFields(this));
    if (fields.length !== MAX_BLOCK_NUMBER_LENGTH) {
      throw new Error(
        `Invalid number of fields for MaxBlockNumber. Expected ${MAX_BLOCK_NUMBER_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  /**
   * Deserializes MaxBlockNumber from a buffer or reader.
   * @param buffer - Buffer to read from.
   * @returns The MaxBlockNumber.
   */
  static fromBuffer(buffer: Buffer | BufferReader): MaxBlockNumber {
    const reader = BufferReader.asReader(buffer);
    return new MaxBlockNumber(reader.readBoolean(), reader.readNumber());
  }

  static fromFields(fields: Fr[] | FieldReader): MaxBlockNumber {
    const reader = FieldReader.asReader(fields);
    return new MaxBlockNumber(reader.readBoolean(), reader.readU32());
  }

  static empty() {
    return new MaxBlockNumber(false, 0);
  }

  isEmpty(): boolean {
    return !this.isSome && this.value === 0;
  }

  /**
   * Create a new instance from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A new instance.
   */
  static from(fields: FieldsOf<MaxBlockNumber>): MaxBlockNumber {
    return new MaxBlockNumber(...MaxBlockNumber.getFields(fields));
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<MaxBlockNumber>) {
    return [fields.isSome, fields.value] as const;
  }
}
