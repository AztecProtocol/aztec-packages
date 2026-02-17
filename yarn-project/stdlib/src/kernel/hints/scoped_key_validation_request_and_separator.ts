import { SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AztecAddress } from '../../aztec-address/index.js';
import { KeyValidationRequestAndSeparator } from './key_validation_request_and_separator.js';

/**
 * Request for validating keys used in the app.
 */
export class ScopedKeyValidationRequestAndSeparator {
  constructor(
    public readonly request: KeyValidationRequestAndSeparator,
    public readonly contractAddress: AztecAddress,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.request, this.contractAddress);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedKeyValidationRequestAndSeparator(
      KeyValidationRequestAndSeparator.fromBuffer(reader),
      AztecAddress.fromBuffer(reader),
    );
  }

  toFields(): Fr[] {
    const fields = [...this.request.toFields(), this.contractAddress.toField()];
    if (fields.length !== SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH) {
      throw new Error(
        `Invalid number of fields for ScopedKeyValidationRequestAndSeparator. Expected ${SCOPED_KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromFields(fields: Fr[] | FieldReader): ScopedKeyValidationRequestAndSeparator {
    const reader = FieldReader.asReader(fields);
    return new ScopedKeyValidationRequestAndSeparator(
      KeyValidationRequestAndSeparator.fromFields(reader),
      AztecAddress.fromFields(reader),
    );
  }

  isEmpty() {
    return this.request.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedKeyValidationRequestAndSeparator(KeyValidationRequestAndSeparator.empty(), AztecAddress.ZERO);
  }
}
