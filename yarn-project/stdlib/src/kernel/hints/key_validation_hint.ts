import { GrumpkinScalar } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class KeyValidationHint {
  constructor(
    /** Master secret key used to derive sk_app and pk_m. */
    public skM: GrumpkinScalar,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new KeyValidationHint(reader.readObject(GrumpkinScalar));
  }

  toBuffer() {
    return serializeToBuffer(this.skM);
  }

  static empty() {
    return new KeyValidationHint(GrumpkinScalar.zero());
  }
}
