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

  /**
   * @returns a random valid address (i.e. one that can be encryted to).
   */
  static random() {
    // About a third of random field elements result in invalid addresses, so we loop until we get a valid one.
    while (true) {
      const candidate = new AztecAddress(Fr.random());
      if (candidate.isValid()) {
        return candidate;
      }
    }
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

  /**
   * @returns true if the address is valid. Invalid addresses cannot receive encrypted messages.
   */
  isValid() {
    // An address is a field value (Fr), which for some purposes is assumed to be the x coordinate of a point in the
    // Grumpkin curve (notably in order to encrypt to it). An address that is not the x coordinate of such a point is
    // called an 'invalid' address.
    //
    // For Grumpkin, y^2 = x^3 − 17 . There exist values x ∈ Fr for which no y satisfies this equation. This means that
    // given such an x and t = x^3 − 17, then sqrt(t) does not exist in Fr.

    const cube = this.value.mul(this.value).mul(this.value);
    const t = cube.sub(new Fr(17));
    return t.sqrt() !== null;
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
