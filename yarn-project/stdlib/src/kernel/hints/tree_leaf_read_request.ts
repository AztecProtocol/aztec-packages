import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

export class TreeLeafReadRequest {
  constructor(
    public value: Fr,
    public leafIndex: Fr,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.leafIndex);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new TreeLeafReadRequest(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toFields(): Fr[] {
    return [this.value, this.leafIndex];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new TreeLeafReadRequest(reader.readField(), reader.readField());
  }

  isEmpty() {
    return this.value.isZero() && this.leafIndex.isZero();
  }

  static empty() {
    return new TreeLeafReadRequest(Fr.zero(), Fr.zero());
  }
}
