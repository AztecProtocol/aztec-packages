import { KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { KeyValidationRequest } from './key_validation_request.js';

/**
 * Request for validating keys used in the app, along with a domain separator for the key type.
 */
export class KeyValidationRequestAndSeparator {
  constructor(
    /** The key validation request. */
    public readonly request: KeyValidationRequest,
    /** Domain separator for the key type, used along with sk_m to derive the sk_app stored in the request. */
    public readonly keyTypeDomainSeparator: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.request, this.keyTypeDomainSeparator);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationRequestAndSeparator(reader.readObject(KeyValidationRequest), Fr.fromBuffer(reader));
  }

  toFields(): Fr[] {
    const fields = [...this.request.toFields(), this.keyTypeDomainSeparator];
    if (fields.length !== KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH) {
      throw new Error(
        `Invalid number of fields for KeyValidationRequestAndSeparator. Expected ${KEY_VALIDATION_REQUEST_AND_GENERATOR_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromFields(fields: Fr[] | FieldReader): KeyValidationRequestAndSeparator {
    const reader = FieldReader.asReader(fields);
    return new KeyValidationRequestAndSeparator(KeyValidationRequest.fromFields(reader), reader.readField());
  }

  isEmpty() {
    return this.request.isEmpty() && this.keyTypeDomainSeparator.isZero();
  }

  static empty() {
    return new KeyValidationRequestAndSeparator(KeyValidationRequest.empty(), Fr.ZERO);
  }
}
