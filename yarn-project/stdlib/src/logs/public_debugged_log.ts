import type { FieldsOf } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';

/**
 * Represents a debug log emitted during public execution.
 */
export class PublicDebuggedLog {
  constructor(
    /** Message ID (currently always 0, reserved for future use) */
    public messageId: number,
    /** The fields array from the DebugLog opcode */
    public fields: Fr[],
  ) {}

  static from(fields: FieldsOf<PublicDebuggedLog>) {
    return new PublicDebuggedLog(fields.messageId, fields.fields);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.messageId, this.fields.length, this.fields]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicDebuggedLog {
    const reader = BufferReader.asReader(buffer);
    const messageId = reader.readNumber();
    const fieldsLength = reader.readNumber();
    const fields = reader.readArray(fieldsLength, Fr);
    return new PublicDebuggedLog(messageId, fields);
  }

  toFields(): Fr[] {
    return serializeToFields([this.messageId, this.fields.length, this.fields]);
  }

  static fromFields(fields: Fr[] | FieldReader): PublicDebuggedLog {
    const reader = FieldReader.asReader(fields);
    const messageId = reader.readField().toNumber();
    const fieldsLength = reader.readField().toNumber();
    const fieldsArray = reader.readFieldArray(fieldsLength);
    return new PublicDebuggedLog(messageId, fieldsArray);
  }

  toString(): string {
    return `PublicDebuggedLog { messageId: ${this.messageId}, fields: [${this.fields.map(f => f.toString()).join(', ')}] }`;
  }

  equals(other: PublicDebuggedLog): boolean {
    return (
      this.messageId === other.messageId &&
      this.fields.length === other.fields.length &&
      this.fields.every((field, index) => field.equals(other.fields[index]))
    );
  }
}
