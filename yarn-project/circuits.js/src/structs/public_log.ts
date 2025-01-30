import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
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

import { PUBLIC_LOG_DATA_SIZE_IN_FIELDS, PUBLIC_LOG_SIZE_IN_FIELDS } from '../constants.gen.js';

export class PublicLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * PUBLIC_LOG_SIZE_IN_FIELDS;

  constructor(public contractAddress: AztecAddress, public log: Tuple<Fr, typeof PUBLIC_LOG_DATA_SIZE_IN_FIELDS>) {}

  toFields(): Fr[] {
    return serializeToFields(...PublicLog.getFields(this));
  }

  static getFields(fields: FieldsOf<PublicLog>) {
    return [fields.contractAddress, fields.log] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicLog(reader.readObject(AztecAddress), reader.readFieldArray(PUBLIC_LOG_DATA_SIZE_IN_FIELDS));
  }

  isEmpty() {
    return this.contractAddress.isZero() && this.log.every(f => f.isZero());
  }

  static empty() {
    return new PublicLog(AztecAddress.ZERO, makeTuple(PUBLIC_LOG_DATA_SIZE_IN_FIELDS, Fr.zero));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(...PublicLog.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicLog(reader.readObject(AztecAddress), reader.readArray(PUBLIC_LOG_DATA_SIZE_IN_FIELDS, Fr));
  }

  static async random() {
    return new PublicLog(await AztecAddress.random(), makeTuple(PUBLIC_LOG_DATA_SIZE_IN_FIELDS, Fr.random));
  }

  equals(other: this) {
    return (
      this.contractAddress.equals(other.contractAddress) &&
      this.log.reduce((acc, field, i) => acc && field.equals(other.log[i]), true)
    );
  }

  toHumanReadable(): string {
    return `PublicLog: (contractAddress: ${this.contractAddress} log: ${this.log})`;
  }

  static get schema() {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        log: z.array(schemas.Fr),
      })
      .transform(({ contractAddress, log }) => PublicLog.fromFields([contractAddress.toField(), ...log]));
  }

  [inspect.custom](): string {
    return `PublicLog {
      contractAddress: ${inspect(this.contractAddress)},
      log: [${this.log.map(x => inspect(x)).join(', ')}],
    }`;
  }
}
