import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AztecAddress } from '../aztec-address/index.js';
import type { Ordered } from './utils/interfaces.js';

export class Nullifier implements Ordered {
  constructor(
    public value: Fr,
    public noteHash: Fr,
    public counter: number,
  ) {}

  toFields(): Fr[] {
    return [this.value, this.noteHash, new Fr(this.counter)];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new Nullifier(reader.readField(), reader.readField(), reader.readU32());
  }

  isEmpty() {
    return this.value.isZero() && this.noteHash.isZero() && !this.counter;
  }

  static empty() {
    return new Nullifier(Fr.zero(), Fr.zero(), 0);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.noteHash, this.counter);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Nullifier(Fr.fromBuffer(reader), Fr.fromBuffer(reader), reader.readNumber());
  }

  toString(): string {
    return `value=${this.value} noteHash=${this.noteHash} counter=${this.counter}`;
  }

  scope(contractAddress: AztecAddress) {
    return new ScopedNullifier(this, contractAddress);
  }
}

export class ScopedNullifier implements Ordered {
  constructor(
    public nullifier: Nullifier,
    public contractAddress: AztecAddress,
  ) {}

  get counter() {
    return this.nullifier.counter;
  }

  get value() {
    return this.nullifier.value;
  }

  get nullifiedNoteHash() {
    return this.nullifier.noteHash;
  }

  toFields(): Fr[] {
    return [...this.nullifier.toFields(), this.contractAddress.toField()];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new ScopedNullifier(reader.readObject(Nullifier), AztecAddress.fromField(reader.readField()));
  }

  isEmpty() {
    return this.nullifier.isEmpty() && this.contractAddress.isZero();
  }

  static empty() {
    return new ScopedNullifier(Nullifier.empty(), AztecAddress.ZERO);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.nullifier, this.contractAddress);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ScopedNullifier(Nullifier.fromBuffer(reader), AztecAddress.fromBuffer(reader));
  }

  toString(): string {
    return `nullifier=${this.nullifier} contractAddress=${this.contractAddress}`;
  }
}
