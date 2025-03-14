import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * Read operations from the public state tree.
 */
export class PublicDataRead {
  constructor(
    /**
     * Index of the leaf in the public data tree.
     */
    public readonly leafSlot: Fr,
    /**
     * Returned value from the public data tree.
     */
    public readonly value: Fr,
    /**
     * Side effect counter tracking position of this event in tx execution.
     */
    public readonly counter: number,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.leafSlot, this.value, this.counter);
  }

  isEmpty() {
    return this.leafSlot.isZero() && this.value.isZero() && !this.counter;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicDataRead(reader.readField(), reader.readField(), reader.readU32());
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataRead(Fr.fromBuffer(reader), Fr.fromBuffer(reader), reader.readNumber());
  }

  static empty() {
    return new PublicDataRead(Fr.ZERO, Fr.ZERO, 0);
  }

  equals(other: PublicDataRead) {
    return this.leafSlot.equals(other.leafSlot) && this.value.equals(other.value) && this.counter == other.counter;
  }
}
