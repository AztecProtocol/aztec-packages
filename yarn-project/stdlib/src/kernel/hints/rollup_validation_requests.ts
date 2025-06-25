import { ROLLUP_VALIDATION_REQUESTS_LENGTH } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { IncludeByTimestamp } from '../../tx/include_by_timestamp.js';

/**
 * Validation requests directed at the rollup, accumulated during the execution of the transaction.
 */
export class RollupValidationRequests {
  constructor(
    /** The highest timestamp of a block in which this transaction can still be included. */
    public includeByTimestamp: IncludeByTimestamp,
  ) {}

  getSize() {
    return this.toBuffer().length;
  }

  toBuffer() {
    return serializeToBuffer(this.includeByTimestamp);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static getFields(fields: FieldsOf<RollupValidationRequests>) {
    return [fields.includeByTimestamp] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new RollupValidationRequests(IncludeByTimestamp.fromFields(reader));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...RollupValidationRequests.getFields(this));
    if (fields.length !== ROLLUP_VALIDATION_REQUESTS_LENGTH) {
      throw new Error(
        `Invalid number of fields for RollupValidationRequests. Expected ${ROLLUP_VALIDATION_REQUESTS_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns Deserialized object.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new RollupValidationRequests(reader.readObject(IncludeByTimestamp));
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns Deserialized object.
   */
  static fromString(str: string) {
    return RollupValidationRequests.fromBuffer(hexToBuffer(str));
  }

  static empty() {
    return new RollupValidationRequests(IncludeByTimestamp.empty());
  }
}
