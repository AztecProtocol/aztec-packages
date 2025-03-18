import { PRIVATE_LOG_SIZE_IN_FIELDS, PUBLIC_LOG_DATA_SIZE_IN_FIELDS } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

export class PrivateLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * PRIVATE_LOG_SIZE_IN_FIELDS;

  constructor(public fields: Tuple<Fr, typeof PRIVATE_LOG_SIZE_IN_FIELDS>) {}

  toFields(): Fr[] {
    return this.fields;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PrivateLog(reader.readFieldArray(PRIVATE_LOG_SIZE_IN_FIELDS));
  }

  isEmpty() {
    return this.fields.every(f => f.isZero());
  }

  static empty() {
    return new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.zero));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.fields);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateLog(reader.readArray(PRIVATE_LOG_SIZE_IN_FIELDS, Fr));
  }

  static random(tag = Fr.random()) {
    return PrivateLog.fromFields([tag, ...Array.from({ length: PRIVATE_LOG_SIZE_IN_FIELDS - 1 }, () => Fr.random())]);
  }

  getEmittedLength() {
    // This assumes that we cut trailing zeroes from the end of the log. In ts, these will always be added back.
    // Does not include length prefix.
    return this.getEmittedFields().length;
  }

  getEmittedFields() {
    const lastNonZeroIndex = this.fields.findLastIndex(f => !f.isZero());
    return this.fields.slice(0, lastNonZeroIndex + 1);
  }

  static get schema() {
    if (PUBLIC_LOG_DATA_SIZE_IN_FIELDS + 1 == PRIVATE_LOG_SIZE_IN_FIELDS) {
      throw new Error(
        'Constants got updated and schema for PublicLog matches that of PrivateLog. This needs to be updated now as Zod is no longer able to differentiate the 2 in TxScopedL2Log.',
      );
    }

    return z
      .object({
        fields: z.array(schemas.Fr),
      })
      .transform(({ fields }) => PrivateLog.fromFields(fields));
  }

  equals(other: PrivateLog) {
    return this.fields.every((field, i) => field.equals(other.fields[i]));
  }

  [inspect.custom](): string {
    return `PrivateLog {
      fields: [${this.fields.map(x => inspect(x)).join(', ')}],
    }`;
  }
}
