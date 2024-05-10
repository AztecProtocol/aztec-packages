import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { type Ordered } from '../interfaces/index.js';

export class LogHash implements Ordered {
  constructor(public value: Fr, public counter: number, public length: Fr) {}

  toFields(): Fr[] {
    return [this.value, new Fr(this.counter), this.length];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new LogHash(reader.readField(), reader.readU32(), reader.readField());
  }

  isEmpty() {
    return this.value.isZero() && this.length.isZero() && !this.counter;
  }

  static empty() {
    return new LogHash(Fr.zero(), 0, Fr.zero());
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.counter, this.length);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new LogHash(Fr.fromBuffer(reader), reader.readNumber(), Fr.fromBuffer(reader));
  }

  toString(): string {
    return `value=${this.value} counter=${this.counter} length=${this.length}`;
  }
}

export class NoteLogHash implements Ordered {
  constructor(public value: Fr, public counter: number, public length: Fr, public noteHash: Fr) {}

  toFields(): Fr[] {
    return [this.value, new Fr(this.counter), this.length, this.noteHash];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new NoteLogHash(reader.readField(), reader.readU32(), reader.readField(), reader.readField());
  }

  isEmpty() {
    return this.value.isZero() && this.length.isZero() && !this.counter && this.noteHash.isZero();
  }

  static empty() {
    return new NoteLogHash(Fr.zero(), 0, Fr.zero(), Fr.zero());
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.counter, this.length, this.noteHash);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new NoteLogHash(Fr.fromBuffer(reader), reader.readNumber(), Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toString(): string {
    return `value=${this.value} counter=${this.counter} length=${this.length} noteHash=${this.noteHash}`;
  }
}
