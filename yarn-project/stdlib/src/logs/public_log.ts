import { FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, PUBLIC_LOG_HEADER_LENGTH } from '@aztec/constants';
import type { FieldsOf } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';

function totalSizeInFields(logs: PublicLog[]) {
  return logs.reduce((acc, log) => acc + log.sizeInFields(), 0);
}

// This class represents logs in the same format as noir does, with a bounded maximum length.
export class FlatPublicLogs {
  // We don't use tuple here because FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH is too large
  constructor(
    public length: number,
    public payload: Fr[],
  ) {
    if (payload.length !== FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH) {
      throw new Error('Invalid payload given to FlatPublicLogs');
    }
    if (length > payload.length) {
      throw new Error('Invalid length given to FlatPublicLogs');
    }
  }

  private static fromUnpaddedPayload(payload: Fr[]) {
    const length = payload.length;
    return new FlatPublicLogs(length, [...payload, ...Array(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - length).fill(Fr.ZERO)]);
  }

  // In blobs, the actual nonempty length of the logs is encoded with the prefix, and then we have the non-padded payload.
  static fromBlobFields(length: number, fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const payload = reader.readFieldArray(length);
    return this.fromUnpaddedPayload(payload);
  }

  toBlobFields() {
    return this.payload.slice(0, this.length);
  }

  static fromLogs(logs: PublicLog[]) {
    return this.fromUnpaddedPayload(logs.flatMap(log => log.toFields()));
  }

  toLogs() {
    const reader = FieldReader.asReader(this.payload);
    const logs = [];
    while (totalSizeInFields(logs) < this.length) {
      logs.push(PublicLog.fromFields(reader));
    }
    if (totalSizeInFields(logs) !== this.length) {
      throw new Error('Wrong length in FlatPublicLogs');
    }
    return logs;
  }

  static get schema(): ZodFor<FlatPublicLogs> {
    return z
      .object({
        length: z.number(),
        payload: z.array(schemas.Fr).min(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH).max(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH),
      })
      .transform(({ length, payload }) => new FlatPublicLogs(length, payload));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.length, this.payload.slice(0, this.length));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const length = reader.readNumber();
    return this.fromUnpaddedPayload(reader.readArray(length, Fr));
  }

  // ToFields and fromFields expect the noir style representation, with constant length payload.
  toFields(): Fr[] {
    return [new Fr(this.length), ...this.payload];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    // We need to do this because field reader returns tuples, which break the type system on these sizes.
    const length = reader.readU32();
    const payload: Fr[] = [];
    for (let i = 0; i < FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH; ++i) {
      payload.push(reader.readField());
    }
    return new FlatPublicLogs(length, payload);
  }

  static empty() {
    return new FlatPublicLogs(0, Array(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH).fill(Fr.ZERO));
  }

  isEmpty() {
    return this.length === 0;
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
