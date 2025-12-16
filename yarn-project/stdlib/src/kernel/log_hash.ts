import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { AztecAddress } from '../aztec-address/index.js';

export class LogHash {
  constructor(
    public value: Fr,
    public length: number,
  ) {}

  static from(fields: FieldsOf<LogHash>) {
    return new LogHash(fields.value, fields.length);
  }

  toFields(): Fr[] {
    return [this.value, new Fr(this.length)];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new LogHash(reader.readField(), reader.readU32());
  }

  isEmpty() {
    return this.value.isZero() && !this.length;
  }

  static empty() {
    return new LogHash(Fr.zero(), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.length);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new LogHash(Fr.fromBuffer(reader), reader.readNumber());
  }

  toString(): string {
    return `value=${this.value} length=${this.length}`;
  }

  scope(contractAddress: AztecAddress) {
    return new ScopedLogHash(this, contractAddress);
  }

  [inspect.custom](): string {
    return `LogHash { ${this.toString()} }`;
  }
}

export class CountedLogHash {
  constructor(
    public logHash: LogHash,
    public counter: number,
  ) {}

  toFields(): Fr[] {
    return [...this.logHash.toFields(), new Fr(this.counter)];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new CountedLogHash(reader.readObject(LogHash), reader.readU32());
  }

  isEmpty() {
    return this.logHash.isEmpty() && !this.counter;
  }

  static empty() {
    return new CountedLogHash(LogHash.empty(), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.logHash, this.counter);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CountedLogHash(LogHash.fromBuffer(reader), reader.readNumber());
  }
}

export class ScopedLogHash {
  constructor(
    public logHash: LogHash,
    public contractAddress: AztecAddress,
  ) {}

  get value() {
    return this.logHash.value;
  }

  toFields(): Fr[] {
    return [...this.logHash.toFields(), this.contractAddress.toField()];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedLogHash(reader.readObject(LogHash), AztecAddress.fromField(reader.readField()));
  }

  isEmpty() {
    return this.logHash.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedLogHash(LogHash.empty(), AztecAddress.ZERO);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.logHash, this.contractAddress);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedLogHash(LogHash.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  toString(): string {
    return `logHash=${this.logHash} contractAddress=${this.contractAddress}`;
  }
}

export class ScopedCountedLogHash {
  constructor(
    public inner: CountedLogHash,
    public contractAddress: AztecAddress,
  ) {}

  toFields(): Fr[] {
    return [...this.inner.toFields(), this.contractAddress.toField()];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedCountedLogHash(reader.readObject(CountedLogHash), AztecAddress.fromField(reader.readField()));
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.inner, this.contractAddress);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedCountedLogHash(CountedLogHash.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  isEmpty() {
    return this.inner.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedCountedLogHash(CountedLogHash.empty(), AztecAddress.ZERO);
  }
}
