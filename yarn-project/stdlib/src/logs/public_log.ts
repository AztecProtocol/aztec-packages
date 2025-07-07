import { PUBLIC_LOG_LENGTH, PUBLIC_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

export class PublicLog {
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * PUBLIC_LOG_LENGTH;

  constructor(
    public contractAddress: AztecAddress,
    public fields: Tuple<Fr, typeof PUBLIC_LOG_SIZE_IN_FIELDS>,
    public emittedLength: number,
  ) {}

  static from(fields: FieldsOf<PublicLog>) {
    return new PublicLog(...PublicLog.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicLog>) {
    return [fields.contractAddress, fields.fields, fields.emittedLength] as const;
  }

  toFields(): Fr[] {
    return serializeToFields(...PublicLog.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PublicLog(
      reader.readObject(AztecAddress),
      reader.readFieldArray(PUBLIC_LOG_SIZE_IN_FIELDS),
      reader.readU32(),
    );
  }

  getEmittedFields() {
    return this.fields.slice(0, this.emittedLength);
  }

  getEmittedFieldsWithoutTag() {
    return this.fields.slice(1, this.emittedLength);
  }

  toBlobFields(): Fr[] {
    return [new Fr(this.emittedLength), this.contractAddress.toField()].concat(this.getEmittedFields());
  }

  static fromBlobFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const emittedLength = reader.readU32();
    const contractAddress = reader.readObject(AztecAddress);
    const emittedFields = reader.readFieldArray(emittedLength);
    return new PublicLog(
      contractAddress,
      padArrayEnd(emittedFields, Fr.ZERO, PUBLIC_LOG_SIZE_IN_FIELDS),
      emittedLength,
    );
  }

  isEmpty() {
    return this.contractAddress.isZero() && this.fields.every(f => f.isZero()) && this.emittedLength === 0;
  }

  static empty() {
    return new PublicLog(AztecAddress.ZERO, makeTuple(PUBLIC_LOG_SIZE_IN_FIELDS, Fr.zero), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(...PublicLog.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicLog(
      reader.readObject(AztecAddress),
      reader.readArray(PUBLIC_LOG_SIZE_IN_FIELDS, Fr),
      reader.readNumber(),
    );
  }

  static async random() {
    return new PublicLog(
      await AztecAddress.random(),
      makeTuple(PUBLIC_LOG_SIZE_IN_FIELDS, Fr.random),
      PUBLIC_LOG_SIZE_IN_FIELDS,
    );
  }

  equals(other: this) {
    return (
      this.contractAddress.equals(other.contractAddress) &&
      this.fields.every((field, i) => field.equals(other.fields[i])) &&
      this.emittedLength === other.emittedLength
    );
  }

  toHumanReadable(): string {
    return `PublicLog: (contractAddress: ${this.contractAddress} fields: ${this.fields}) emittedLength: ${this.emittedLength}`;
  }

  static get schema(): ZodFor<PublicLog> {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        fields: z.array(schemas.Fr).refine(arr => arr.length === PUBLIC_LOG_SIZE_IN_FIELDS),
        emittedLength: z.number(),
      })
      .transform(({ contractAddress, fields, emittedLength }) =>
        PublicLog.fromFields([contractAddress.toField(), ...fields, new Fr(emittedLength)]),
      );
  }

  [inspect.custom](): string {
    return `PublicLog {
      contractAddress: ${inspect(this.contractAddress)},
      fields: [${this.fields.map(x => inspect(x)).join(', ')}],
      emittedLength: ${this.emittedLength},
    }`;
  }
}
