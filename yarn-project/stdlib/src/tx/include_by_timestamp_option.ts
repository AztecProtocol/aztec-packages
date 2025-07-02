import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { UInt64 } from '../types/index.js';

/**
 * Maximum block timestamp value at which the transaction can still be included.
 */
export class IncludeByTimestampOption {
  constructor(
    /**
     * Whether max inclusion timestamp was requested.
     */
    public isSome: boolean,
    /**
     * The requested max inclusion timestamp of a block, if isSome is true.
     */
    public value: UInt64,
  ) {
    // For sanity we check that the value is less than 2 ** 64.
    if (value >= 1n << 64n) {
      throw new Error('Value is not a u64.');
    }
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(...IncludeByTimestampOption.getFields(this));
  }

  toFields(): Fr[] {
    return serializeToFields(...IncludeByTimestampOption.getFields(this));
  }

  /**
   * Deserializes IncludeByTimestamp from a buffer or reader.
   * @param buffer - Buffer to read from.
   * @returns The IncludeByTimestamp.
   */
  static fromBuffer(buffer: Buffer | BufferReader): IncludeByTimestampOption {
    const reader = BufferReader.asReader(buffer);
    const isSome = reader.readBoolean();
    // UInt64 is aliased to bigint in TypeScript, causing it to be serialized as a 256-bit integer.
    // Therefore, we must read it back using readUInt256() rather than readUInt64().
    const value = reader.readUInt256();
    return new IncludeByTimestampOption(isSome, value);
  }

  static fromFields(fields: Fr[] | FieldReader): IncludeByTimestampOption {
    const reader = FieldReader.asReader(fields);
    return new IncludeByTimestampOption(reader.readBoolean(), reader.readU64());
  }

  static empty() {
    return new IncludeByTimestampOption(false, 0n);
  }

  isEmpty(): boolean {
    return !this.isSome && this.value === 0n;
  }

  /**
   * Create a new instance from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A new instance.
   */
  static from(fields: FieldsOf<IncludeByTimestampOption>): IncludeByTimestampOption {
    return new IncludeByTimestampOption(...IncludeByTimestampOption.getFields(fields));
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<IncludeByTimestampOption>) {
    return [fields.isSome, fields.value] as const;
  }
}
