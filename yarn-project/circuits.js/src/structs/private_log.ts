import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { PRIVATE_LOG_SIZE_IN_FIELDS } from '../constants.gen.js';

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

  static random() {
    return new PrivateLog(makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, Fr.random));
  }

  static get schema() {
    return z
      .object({
        fields: z.array(schemas.Fr),
      })
      .transform(({ fields }) => PrivateLog.fromFields(fields));
  }

  [inspect.custom](): string {
    return `PrivateLog {
      fields: [${this.fields.map(x => inspect(x)).join(', ')}],
    }`;
  }
}
