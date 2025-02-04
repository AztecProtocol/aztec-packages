import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { CONTRACT_CLASS_LOG_DATA_LENGTH } from '../constants.gen.js';
import { ContractClassLog } from './contract_class_log.js';
import { type UInt32 } from './shared.js';

export class ContractClassLogData {
  constructor(public log: ContractClassLog, public counter: UInt32, public logSize: UInt32) {}

  static from(fields: FieldsOf<ContractClassLogData>): ContractClassLogData {
    return new ContractClassLogData(...ContractClassLogData.getFields(fields));
  }

  static getFields(fields: FieldsOf<ContractClassLogData>) {
    return [fields.log, fields.counter, fields.logSize] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): ContractClassLogData {
    const reader = FieldReader.asReader(fields);
    return new ContractClassLogData(reader.readObject(ContractClassLog), reader.readU32(), reader.readU32());
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...ContractClassLogData.getFields(this));
    if (fields.length !== CONTRACT_CLASS_LOG_DATA_LENGTH) {
      throw new Error(
        `Invalid number of fields for ContractClassLogData. Expected ${CONTRACT_CLASS_LOG_DATA_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ContractClassLogData(reader.readObject(ContractClassLog), reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...ContractClassLogData.getFields(this));
  }

  static empty() {
    return new ContractClassLogData(ContractClassLog.empty(), 0, 0);
  }

  isEmpty(): boolean {
    return this.log.isEmpty() && !this.counter;
  }

  [inspect.custom]() {
    return `ContractClassLogData {
      log: ${this.log}
      counter: ${this.counter}
    }`;
  }
}

export class ScopedContractClassLogData {
  constructor(public inner: ContractClassLogData, public contractAddress: AztecAddress) {}

  static from(fields: FieldsOf<ScopedContractClassLogData>): ScopedContractClassLogData {
    return new ScopedContractClassLogData(...ScopedContractClassLogData.getFields(fields));
  }

  static getFields(fields: FieldsOf<ScopedContractClassLogData>) {
    return [fields.inner, fields.contractAddress] as const;
  }

  toFields(): Fr[] {
    return serializeToFields(...ScopedContractClassLogData.getFields(this));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedContractClassLogData(
      reader.readObject(ContractClassLogData),
      AztecAddress.fromField(reader.readField()),
    );
  }

  isEmpty() {
    return this.inner.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedContractClassLogData(ContractClassLogData.empty(), AztecAddress.ZERO);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(...ScopedContractClassLogData.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedContractClassLogData(ContractClassLogData.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  getEmittedLength() {
    // TODO(MW): This doesn't work if we have valid 0s inside contract class logs
    return this.inner.log.getEmittedLength();
  }

  [inspect.custom]() {
    return `ScopedContractClassLogData {
      inner: ${this.inner}
      contractAddress: ${this.contractAddress}
    }`;
  }
}
