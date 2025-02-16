import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '../constants.gen.js';

export class ContractClassLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * CONTRACT_CLASS_LOG_SIZE_IN_FIELDS;

  // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
  // public fields: Tuple<Fr, typeof CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>
  constructor(public fields: Fr[]) {
    if (fields.length !== CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) {
      throw new Error(
        `Invalid number of fields for ContractClassLog. Expected ${CONTRACT_CLASS_LOG_SIZE_IN_FIELDS}, got ${fields.length}`,
      );
    }
  }

  toFields(): Fr[] {
    return this.fields;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // return new ContractClassLog(reader.readFieldArray(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS));
    return new ContractClassLog(Array.from({ length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS }, () => reader.readField()));
  }

  isEmpty() {
    return this.fields.every(f => f.isZero());
  }

  static empty() {
    return new ContractClassLog(new Array(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS).fill(Fr.ZERO));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.fields);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // reader.readArray(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, Fr);
    const fields = Array.from({ length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS }, () =>
      reader.remainingBytes() == 0 ? Fr.ZERO : Fr.fromBuffer(reader),
    );
    return new ContractClassLog(fields);
  }

  clone() {
    return ContractClassLog.fromBuffer(this.toBuffer());
  }

  static random() {
    // TODO(MW): Lazily used /2 instead of CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, because this keeps overfilling block blobs
    // Below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    // makeTuple(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, Fr.random);
    const fields = Array.from({ length: Math.ceil(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS / 2) }, () => Fr.random());
    return new ContractClassLog(
      fields.concat(Array.from({ length: Math.floor(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS / 2) }, () => Fr.ZERO)),
    );
  }

  getEmittedLength() {
    // This assumes that we cut trailing zeroes from the end of the log. In ts, these will always be added back.
    return this.getEmittedFields().length;
  }

  getEmittedFields() {
    let lastZeroIndex = 0;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      if (!this.fields[i].isZero() && lastZeroIndex == 0) {
        lastZeroIndex = i + 1;
        break;
      }
    }
    return this.fields.slice(0, lastZeroIndex);
  }

  static get schema() {
    return z
      .object({
        fields: z.array(schemas.Fr),
      })
      .transform(({ fields }) => ContractClassLog.fromFields(fields));
  }

  [inspect.custom](): string {
    return `ContractClassLog {
      fields: [${this.fields.map((x: Fr) => inspect(x)).join(', ')}],
    }`;
  }
}
