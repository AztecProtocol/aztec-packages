import { PUBLIC_LOG_HEADER_LENGTH } from '@aztec/constants';
import type { FieldsOf } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

// export class FlatPublicLogs {
//   constructor(
//     public length: number,
//     public payload: Fr[], // Can't use tuple here due to excessive length
//   ) {
//     if (payload.length !== PUBLIC_LOGS_PAYLOAD_LENGTH) {
//       throw new Error(
//         `Invalid number of fields for FlatPublicLogs. Expected ${PUBLIC_LOGS_PAYLOAD_LENGTH}, got ${payload.length}`,
//       );
//     }
//   }

//   static get schema(): ZodFor<FlatPublicLogs> {
//     return z
//       .object({
//         length: z.number(),
//         payload: z.array(schemas.Fr).length(PUBLIC_LOGS_PAYLOAD_LENGTH),
//       })
//       .transform(({ length, payload }) => new FlatPublicLogs(length, payload));
//   }
// }

export class PublicLogs {
  constructor(public logs: PublicLog[]) {}

  static get schema(): ZodFor<PublicLogs> {
    return z.object({ logs: z.array(PublicLog.schema) }).transform(({ logs }) => new PublicLogs(logs));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.logs.length, this.logs);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const logsLength = reader.readNumber();
    return new PublicLogs(reader.readArray(logsLength, PublicLog));
  }

  toFields(): Fr[] {
    return [new Fr(this.logs.length), ...this.logs.flatMap(log => log.toFields())];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const logCount = reader.readU32();
    return new PublicLogs(reader.readArray(logCount, PublicLog));
  }

  sizeInFields() {
    return /* log count */ 1 + this.logs.reduce((acc, log) => acc + log.sizeInFields(), 0);
  }

  toBlobFields(): {
    fieldsCount: number;
    fields: Fr[];
  } {
    const flattenedPublicLogs = this.logs.reduce((acc, log) => acc.concat(log.toFields()), [] as Fr[]);
    return {
      // TODO remove fields count. Maybe make FlatPublicLogs?
      fieldsCount: flattenedPublicLogs.length,
      fields: flattenedPublicLogs,
    };
  }

  static fromBlobFields(fieldsCount: number, fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const logs = [];
    while (logs.reduce((acc, log) => acc + log.sizeInFields(), 0) < fieldsCount) {
      logs.push(PublicLog.fromFields(reader));
    }
    if (logs.reduce((acc, log) => acc + log.sizeInFields(), 0) !== fieldsCount) {
      throw new Error('Invalid fields count given to PublicLogs.fromBlobFields()');
    }
    return new PublicLogs(logs);
  }

  static empty() {
    return new PublicLogs([]);
  }

  isEmpty() {
    return this.logs.length === 0;
  }

  equals(other: PublicLogs) {
    return this.logs.length === other.logs.length && this.logs.every((log, i) => log.equals(other.logs[i]));
  }

  [inspect.custom](): string {
    return `PublicLogs [${this.logs.map(x => inspect(x)).join(', ')}]`;
  }
}

export class PublicLog {
  constructor(
    public contractAddress: AztecAddress,
    public fields: Fr[],
  ) {}

  static from(fields: FieldsOf<PublicLog>) {
    return new PublicLog(...PublicLog.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicLog>) {
    return [fields.contractAddress, fields.fields] as const;
  }

  toFields(): Fr[] {
    return [new Fr(this.fields.length), this.contractAddress.toField(), ...this.fields];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const fieldsLength = reader.readU32();
    return new PublicLog(reader.readObject(AztecAddress), reader.readFieldArray(fieldsLength));
  }

  sizeInFields() {
    return this.fields.length + PUBLIC_LOG_HEADER_LENGTH;
  }

  getEmittedFields() {
    return this.fields.slice(0);
  }

  getEmittedFieldsWithoutTag() {
    return this.fields.slice(1);
  }

  isEmpty() {
    return this.contractAddress.isZero() && this.fields.length === 0;
  }

  static empty() {
    return new PublicLog(AztecAddress.ZERO, []);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.fields.length, this.contractAddress, this.fields);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const fieldsLength = reader.readNumber();
    return new PublicLog(reader.readObject(AztecAddress), reader.readArray(fieldsLength, Fr));
  }

  static async random() {
    return new PublicLog(
      await AztecAddress.random(),
      Array.from({ length: 10 }, () => Fr.random()),
    );
  }

  equals(other: this) {
    return (
      this.fields.length === other.fields.length &&
      this.contractAddress.equals(other.contractAddress) &&
      this.fields.every((field, i) => field.equals(other.fields[i]))
    );
  }

  toHumanReadable(): string {
    return `PublicLog: (contractAddress: ${this.contractAddress} fields: ${this.fields})`;
  }

  static get schema(): ZodFor<PublicLog> {
    return z
      .object({
        contractAddress: AztecAddress.schema,
        fields: z.array(schemas.Fr),
      })
      .transform(({ contractAddress, fields }) => PublicLog.from({ contractAddress, fields }));
  }

  [inspect.custom](): string {
    return `PublicLog {
      contractAddress: ${inspect(this.contractAddress)},
      fields: [${this.fields.map(x => inspect(x)).join(', ')}],
    }`;
  }
}
