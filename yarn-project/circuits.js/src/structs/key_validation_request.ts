import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { KEY_VALIDATION_REQUEST_LENGTH, SCOPED_KEY_VALIDATION_REQUEST_LENGTH } from '../constants.gen.js';

/**
 * Request for validating a nullifier key pair used in the app.
 */
export class KeyValidationRequest {
  constructor(
    /**
     * Public key of the nullifier key (Npk_m).
     */
    public readonly masterNullifierPublicKey: Point,
    /**
     * App-siloed nullifier secret key (nsk_app*).
     */
    public readonly appNullifierSecretKey: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.masterNullifierPublicKey, this.appNullifierSecretKey);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationRequest(Point.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toFields(): Fr[] {
    const fields = [this.masterNullifierPublicKey.toFields(), this.appNullifierSecretKey].flat();
    if (fields.length !== KEY_VALIDATION_REQUEST_LENGTH) {
      throw new Error(
        `Invalid number of fields for KeyValidationRequest. Expected ${KEY_VALIDATION_REQUEST_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromFields(fields: Fr[] | FieldReader): KeyValidationRequest {
    const reader = FieldReader.asReader(fields);
    return new KeyValidationRequest(Point.fromFields(reader), reader.readField());
  }

  isEmpty() {
    return this.masterNullifierPublicKey.isZero() && this.appNullifierSecretKey.isZero();
  }

  static empty() {
    return new KeyValidationRequest(Point.ZERO, Fr.ZERO);
  }
}

/**
 * Request for validating a nullifier key pair used in the app.
 */
export class ScopedKeyValidationRequest {
  constructor(public readonly request: KeyValidationRequest, public readonly contractAddress: AztecAddress) {}

  toBuffer() {
    return serializeToBuffer(this.request, this.contractAddress);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedKeyValidationRequest(KeyValidationRequest.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  toFields(): Fr[] {
    const fields = [...this.request.toFields(), this.contractAddress];
    if (fields.length !== SCOPED_KEY_VALIDATION_REQUEST_LENGTH) {
      throw new Error(
        `Invalid number of fields for ScopedKeyValidationRequest. Expected ${SCOPED_KEY_VALIDATION_REQUEST_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromFields(fields: Fr[] | FieldReader): ScopedKeyValidationRequest {
    const reader = FieldReader.asReader(fields);
    return new ScopedKeyValidationRequest(KeyValidationRequest.fromFields(reader), AztecAddress.fromFields(reader));
  }

  isEmpty() {
    return this.request.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedKeyValidationRequest(KeyValidationRequest.empty(), AztecAddress.ZERO);
  }
}
