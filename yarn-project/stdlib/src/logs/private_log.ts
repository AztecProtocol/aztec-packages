import { PRIVATE_LOG_LENGTH, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

export class PrivateLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * PRIVATE_LOG_LENGTH;

  constructor(
    public fields: Tuple<Fr, typeof PRIVATE_LOG_SIZE_IN_FIELDS>,
    // Named `emittedLength` instead of `length` to avoid being confused with fields.length.
    public emittedLength: number,
  ) {}

  static from(fields: FieldsOf<PrivateLog>) {
    return new PrivateLog(...PrivateLog.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateLog>) {
    return [fields.fields, fields.emittedLength] as const;
  }

  toFields(): Fr[] {
    return serializeToFields(...PrivateLog.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PrivateLog(reader.readFieldArray(PRIVATE_LOG_SIZE_IN_FIELDS), reader.readU32());
  }

  getEmittedFields() {
    return this.fields.slice(0, this.emittedLength);
  }

  getEmittedFieldsWithoutTag() {
    return this.fields.slice(1, this.emittedLength);
  }

  toBlobFields(): Fr[] {
    return [new Fr(this.emittedLength)].concat(this.getEmittedFields());
  }

  static fromBlobFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const emittedLength = reader.readU32();
    const emittedFields = reader.readFieldArray(emittedLength);
    return new PrivateLog(padArrayEnd(emittedFields, Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS), emittedLength);
  }

  isEmpty() {
    return this.fields.every(f => f.isZero());
  }

  static empty() {
    return new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.zero), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.fields, this.emittedLength);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateLog(reader.readArray(PRIVATE_LOG_SIZE_IN_FIELDS, Fr), reader.readNumber());
  }

  static random(tag = Fr.random()) {
    const fields = makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.random);
    fields[0] = tag;
    return new PrivateLog(fields, PRIVATE_LOG_SIZE_IN_FIELDS);
  }

  static get schema() {
    return z
      .object({
        fields: z.array(schemas.Fr),
        emittedLength: z.number(),
      })
      .strict()
      .transform(({ fields, emittedLength }) => PrivateLog.fromFields(fields.concat(new Fr(emittedLength))));
  }

  equals(other: PrivateLog) {
    return this.fields.every((field, i) => field.equals(other.fields[i])) && this.emittedLength === other.emittedLength;
  }

  [inspect.custom](): string {
    return `PrivateLog {
      fields: [${this.fields.map(x => inspect(x)).join(', ')}],
      emittedLength: ${this.emittedLength},
    }`;
  }
}
