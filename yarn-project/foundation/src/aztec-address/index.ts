/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { inspect } from 'util';

import { Fr, fromBuffer } from '../fields/index.js';
import { type BufferReader, FieldReader } from '../serialize/index.js';
import { TypeRegistry } from '../serialize/type_registry.js';
import { hexToBuffer } from '../string/index.js';

/** Branding to ensure fields are not interchangeable types. */
export interface AztecAddress {
  /** Brand. */
  _branding: 'AztecAddress';
}
/**
 * AztecAddress represents a 32-byte address in the Aztec Protocol.
 * It provides methods to create, manipulate, and compare addresses.
 * The maximum value of an address is determined by the field modulus and all instances of AztecAddress.
 * It should have a value less than or equal to this max value.
 * This class also provides helper functions to convert addresses from strings, buffers, and other formats.
 */
export class AztecAddress {
  private value: Fr;

  constructor(buffer: Buffer | Fr) {
    if ('length' in buffer && buffer.length !== 32) {
      throw new Error(`Invalid AztecAddress length ${buffer.length}.`);
    }
    this.value = new Fr(buffer);
  }

  [inspect.custom]() {
    return `AztecAddress<${this.toString()}>`;
  }

  static isAddress(str: string) {
    return /^(0x)?[a-fA-F0-9]{64}$/.test(str);
  }

  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  static ZERO = new AztecAddress(Buffer.alloc(32, 0));

  static zero(): AztecAddress {
    return AztecAddress.ZERO;
  }

  static fromField(fr: Fr) {
    return new AztecAddress(fr);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return new AztecAddress(fromBuffer(buffer, Fr));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new AztecAddress(reader.readField());
  }

  static fromBigInt(value: bigint) {
    return new AztecAddress(new Fr(value));
  }

  static fromNumber(value: number) {
    return new AztecAddress(new Fr(value));
  }

  static fromString(buf: string) {
    return new AztecAddress(hexToBuffer(buf));
  }

  static random() {
    return new AztecAddress(Fr.random());
  }

  get size() {
    return this.value.size;
  }

  equals(other: AztecAddress) {
    return this.value.equals(other.value);
  }

  isZero() {
    return this.value.isZero();
  }

  toBuffer() {
    return this.value.toBuffer();
  }

  toBigInt() {
    return this.value.toBigInt();
  }

  toField() {
    return this.value;
  }

  toString() {
    return this.value.toString();
  }

  toJSON() {
    return {
      type: 'AztecAddress',
      value: this.toString(),
    };
  }
}

// For deserializing JSON.
TypeRegistry.register('AztecAddress', AztecAddress);
