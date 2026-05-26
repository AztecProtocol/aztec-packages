import { KEY_VALIDATION_REQUEST_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * Request for validating keys used in the app.
 *
 * The master public key is exposed only as `pkMHash` (its `hashPublicKey` digest).
 * The kernel reset circuit derives the corresponding point from the master secret key hint and
 * asserts that its hash matches `pkMHash`.
 */
export class KeyValidationRequest {
  /** App-siloed secret key corresponding to the same underlying secret as `pkMHash`. */
  public readonly skApp: Fr;

  constructor(
    /** Hash of the master public key corresponding to the same underlying secret as `skApp`. */
    public readonly pkMHash: Fr,
    skApp: Fr | GrumpkinScalar,
  ) {
    // skApp may arrive as a GrumpkinScalar (Fq) in some code paths; safe to truncate to Fr because
    // the value originally came from an Fr poseidon hash and was widened to GrumpkinScalar.
    this.skApp = skApp instanceof Fr ? skApp : new Fr(skApp.toBigInt());
  }

  toBuffer() {
    return serializeToBuffer(this.pkMHash, this.skApp);
  }

  get skAppAsGrumpkinScalar() {
    return new GrumpkinScalar(this.skApp.toBigInt());
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationRequest(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toFields(): Fr[] {
    const fields = [this.pkMHash, this.skApp];
    if (fields.length !== KEY_VALIDATION_REQUEST_LENGTH) {
      throw new Error(
        `Invalid number of fields for KeyValidationRequest. Expected ${KEY_VALIDATION_REQUEST_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromFields(fields: Fr[] | FieldReader): KeyValidationRequest {
    const reader = FieldReader.asReader(fields);
    return new KeyValidationRequest(reader.readField(), reader.readField());
  }

  isEmpty() {
    return this.pkMHash.isZero() && this.skApp.isZero();
  }

  static empty() {
    return new KeyValidationRequest(Fr.ZERO, Fr.ZERO);
  }

  static random() {
    return new KeyValidationRequest(Fr.random(), Fr.random());
  }
}
