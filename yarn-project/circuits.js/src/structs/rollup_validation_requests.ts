import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { ROLLUP_VALIDATION_REQUESTS_LENGTH } from '../constants.gen.js';
import { MaxBlockNumber } from './max_block_number.js';

/**
 * Validation requests directed at the rollup, accumulated during the execution of the transaction.
 */
export class RollupValidationRequests {
  constructor(
    /**
     * The largest block number in which this transaction can be included.
     */
    public maxBlockNumber: MaxBlockNumber,
  ) {}

  getSize() {
    return this.toBuffer().length;
  }

  toBuffer() {
    return serializeToBuffer(this.maxBlockNumber);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static getFields(fields: FieldsOf<RollupValidationRequests>) {
    return [fields.maxBlockNumber] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new RollupValidationRequests(MaxBlockNumber.fromFields(reader));
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
    return new RollupValidationRequests(reader.readObject(MaxBlockNumber));
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
    return new RollupValidationRequests(MaxBlockNumber.empty());
  }
}
