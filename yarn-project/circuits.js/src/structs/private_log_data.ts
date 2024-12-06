import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { PRIVATE_LOG_DATA_LENGTH } from '../constants.gen.js';
import { PrivateLog } from './private_log.js';
import { type UInt32 } from './shared.js';

export class PrivateLogData {
  constructor(public log: PrivateLog, public noteHashCounter: UInt32, public counter: UInt32) {}

  static from(fields: FieldsOf<PrivateLogData>): PrivateLogData {
    return new PrivateLogData(...PrivateLogData.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateLogData>) {
    return [fields.log, fields.noteHashCounter, fields.counter] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PrivateLogData {
    const reader = FieldReader.asReader(fields);
    return new PrivateLogData(reader.readObject(PrivateLog), reader.readU32(), reader.readU32());
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateLogData.getFields(this));
    if (fields.length !== PRIVATE_LOG_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateLogData. Expected ${PRIVATE_LOG_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateLogData(reader.readObject(PrivateLog), reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...PrivateLogData.getFields(this));
  }

  static empty() {
    return new PrivateLogData(PrivateLog.empty(), 0, 0);
  }

  isEmpty(): boolean {
    return this.log.isEmpty() && !this.noteHashCounter && !this.counter;
  }

  [inspect.custom]() {
    return `PrivateLogData {
      log: ${this.log}
      noteHashCounter: ${this.noteHashCounter}
      counter: ${this.counter}
    }`;
  }
}

export class ScopedPrivateLogData {
  constructor(public inner: PrivateLogData, public contractAddress: AztecAddress) {}

  static from(fields: FieldsOf<ScopedPrivateLogData>): ScopedPrivateLogData {
    return new ScopedPrivateLogData(...ScopedPrivateLogData.getFields(fields));
  }

  static getFields(fields: FieldsOf<ScopedPrivateLogData>) {
    return [fields.inner, fields.contractAddress] as const;
  }

  toFields(): Fr[] {
    return serializeToFields(...ScopedPrivateLogData.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedPrivateLogData(reader.readObject(PrivateLogData), AztecAddress.fromField(reader.readField()));
  }

  isEmpty() {
    return this.inner.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedPrivateLogData(PrivateLogData.empty(), AztecAddress.ZERO);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(...ScopedPrivateLogData.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedPrivateLogData(PrivateLogData.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  [inspect.custom]() {
    return `ScopedPrivateLogData {
      inner: ${this.inner}
      contractAddress: ${this.contractAddress}
    }`;
  }
}
