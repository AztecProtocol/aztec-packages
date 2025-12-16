/* eslint-disable camelcase */
import { bls12_381 } from '@noble/curves/bls12-381';
import { inspect } from 'util';

import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/random/index.js';
import { hexSchemaFor } from '../schemas/utils.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { TypeRegistry } from '../serialize/type_registry.js';
import { Fr } from './fields.js';

/**
 * Represents a field derived from BLS12Field.
 */
type BLS12DerivedField<T extends BLS12Field> = {
  new (value: any): T;
  /**
   * All derived fields will specify MODULUS and SIZE_IN_BYTES.
   */
  MODULUS: bigint;
  SIZE_IN_BYTES: number;
};

/**
 * Base BLS12field class.
 */
export abstract class BLS12Field {
  private asBuffer?: Buffer;
  private asBigInt?: bigint;

  protected constructor(value: number | bigint | Buffer) {
    if (Buffer.isBuffer(value)) {
      if (value.length > this.size()) {
        throw new Error(`Value length ${value.length} exceeds ${this.size()}`);
      }
      this.asBuffer =
        value.length === this.size() ? value : Buffer.concat([Buffer.alloc(this.size() - value.length), value]);
      this.toBigInt();
    } else if (typeof value === 'bigint' || typeof value === 'number') {
      this.asBigInt = BigInt(value);
      if (this.asBigInt >= this.modulus()) {
        throw new Error(`Value 0x${this.asBigInt.toString(16)} is greater or equal to field modulus.`);
      }
      this.toBuffer();
    } else {
      throw new Error(`Type '${typeof value}' with value '${value}' passed to BLS12Field constructor.`);
    }
  }

  protected abstract modulus(): bigint;
  protected abstract size(): number;

  /**
   * We return a copy of the Buffer to ensure this remains immutable.
   */
  toBuffer(): Buffer {
    if (!this.asBuffer) {
      this.asBuffer = toBufferBE(this.asBigInt!, this.size());
    }
    return Buffer.from(this.asBuffer);
  }

  toString(): `0x${string}` {
    return `0x${this.toBuffer().toString('hex')}`;
  }

  toBigInt(): bigint {
    if (this.asBigInt === undefined) {
      this.asBigInt = toBigIntBE(this.asBuffer!);
      if (this.asBigInt >= this.modulus()) {
        throw new Error(`Value 0x${this.asBigInt.toString(16)} is greater or equal to field modulus.`);
      }
    }
    return this.asBigInt;
  }

  toNoirBigNum(): { limbs: string[] } {
    const buffer = this.toBuffer();
    const limbs = [];
    // Split into 120 bit (=15 byte) limbs
    for (let i = 0; i < Math.ceil(this.size() / 15); i++) {
      limbs.push(buffer.subarray(-(i + 1) * 15, this.size() - i * 15));
    }
    return {
      limbs: limbs.map(l => `0x${l.toString('hex')}`),
    };
  }

  equals(rhs: BLS12Field): boolean {
    return this.toBuffer().equals(rhs.toBuffer());
  }

  lt(rhs: BLS12Field): boolean {
    return this.toBigInt() < rhs.toBigInt();
  }

  isZero(): boolean {
    return this.toBigInt() === 0n;
  }

  isEmpty(): boolean {
    return this.isZero();
  }

  isNegative(): boolean {
    // Returns whether the field element is above the halfway point of (p-1)/2
    // Generally referred to as 'negative' but also referred to as 'greater' (e.g. in point compression)
    return this.toBigInt() > (this.modulus() - 1n) / 2n;
  }

  toFriendlyJSON(): string {
    return this.toString();
  }

  toField() {
    return this;
  }
}

/**
 * Constructs a field from a Buffer of BufferReader.
 * It maybe not read the full SIZE_IN_BYTES bytes if the Buffer is shorter, but it will padded in BLS12Field constructor.
 */
function fromBuffer<T extends BLS12Field>(buffer: Buffer | BufferReader, f: BLS12DerivedField<T>) {
  const reader = BufferReader.asReader(buffer);
  return new f(reader.readBytes(f.SIZE_IN_BYTES));
}

/**
 * Returns a random field element.
 */
function random<T extends BLS12Field>(f: BLS12DerivedField<T>): T {
  return new f(toBigIntBE(randomBytes(f.SIZE_IN_BYTES * 2)) % f.MODULUS);
}

/**
 * Constructs a field from a 0x prefixed hex string.
 */
function fromHexString<T extends BLS12Field>(str: string, f: BLS12DerivedField<T>) {
  return new f(bufferFromHexString(str));
}

/**
 * Constructs a field from noir BigNum type.
 */
function fromNoirBigNum<T extends BLS12Field>(bignum: { limbs: string[] }, f: BLS12DerivedField<T>) {
  // We have 120 bit (=15 byte) limbs
  let bigint = 0n;
  for (let i = 0; i < bignum.limbs.length; i++) {
    bigint += BigInt(bignum.limbs[i]) << BigInt(120 * i);
  }
  return new f(bigint);
}

/**
 * Constructs a buffer from a hex string.
 * Differs from bigint-buffer's fromHex() by allowing odd number of characters.
 */
function bufferFromHexString(str: string) {
  const withoutPrefix = str.replace(/^0x/i, '');
  const checked = withoutPrefix.match(/^[0-9A-F]+$/i)?.[0];
  if (checked === undefined) {
    throw new Error(`Invalid hex-encoded string: "${str}"`);
  }
  return Buffer.from(checked.length % 2 === 1 ? '0' + checked : checked, 'hex');
}

/**
 * Fr field class.
 * @dev This class is used to represent elements of BLS12-381 scalar field.
 */
export class BLS12Fr extends BLS12Field {
  static SIZE_IN_BYTES = bls12_381.fields.Fr.BYTES;
  static MODULUS = bls12_381.fields.Fr.ORDER;
  static ZERO = new BLS12Fr(0n);
  static ONE = new BLS12Fr(1n);
  static MAX_FIELD_VALUE = new BLS12Fr(this.MODULUS - 1n);

  constructor(value: number | bigint | Buffer) {
    super(value);
  }

  [inspect.custom]() {
    return `BLS12Fr<${this.toString()}>`;
  }

  protected modulus() {
    return BLS12Fr.MODULUS;
  }

  protected size() {
    return BLS12Fr.SIZE_IN_BYTES;
  }

  static random() {
    return random(BLS12Fr);
  }

  static zero() {
    return BLS12Fr.ZERO;
  }

  static isZero(value: BLS12Fr) {
    return value.isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, BLS12Fr);
  }

  /**
   * Creates a BLS12Fr instance from a string.
   * @param buf - the string to create a BLS12Fr from.
   * @returns the BLS12Fr instance
   * @remarks if the string only consists of numbers, we assume we are parsing a bigint,
   * otherwise we require the hex string to be prepended with "0x", to ensure there is no misunderstanding
   * as to what is being parsed.
   */
  static fromString(buf: string) {
    if (buf.match(/^\d+$/) !== null) {
      return new BLS12Fr(toBufferBE(BigInt(buf), BLS12Fr.SIZE_IN_BYTES));
    }
    if (buf.match(/^0x/i) !== null) {
      return fromHexString(buf, BLS12Fr);
    }

    throw new Error(`Tried to create a BLS12Fr from an invalid string: ${buf}`);
  }

  /**
   * Creates a BLS12Fr instance from a hex string.
   * @param buf - a hex encoded string.
   * @returns the BLS12Fr instance
   */
  static fromHexString(buf: string) {
    return fromHexString(buf, BLS12Fr);
  }

  /**
   * Constructs a field from noir BigNum type.
   */
  static fromNoirBigNum(bignum: { limbs: string[] }) {
    return fromNoirBigNum(bignum, BLS12Fr);
  }

  /**
   * Creates a BLS12Fr instance from a BN254 Fr instance.
   * @dev The BN254 field size < BLS12_381, so we cannot overflow here.
   * Useful for blob related calculations.
   * @param field - a BN254 Fr instance.
   * @returns the BLS12Fr instance
   */
  static fromBN254Fr(field: Fr) {
    return BLS12Fr.fromBuffer(field.toBuffer());
  }

  /**
   * Creates a BN254 Fr instance from a BLS12Fr instance.
   * @dev The BN254 field size < BLS12_381, so we must check the size here
   * Useful for blob related calculations.
   * @param field - a BLS12Fr instance.
   * @returns the BN254 Fr instance
   */
  toBN254Fr() {
    if (this.toBigInt() >= Fr.MODULUS) {
      throw new Error(`BLS12-381 Fr field ${this} too large to be converted into a BN254 Fr field`);
    }
    return Fr.fromBuffer(this.toBuffer());
  }

  /** Arithmetic - wrapper around noble curves */

  add(rhs: BLS12Fr) {
    return new BLS12Fr(bls12_381.fields.Fr.add(this.toBigInt(), rhs.toBigInt()));
  }

  square() {
    return new BLS12Fr(bls12_381.fields.Fr.sqr(this.toBigInt()));
  }

  negate() {
    return new BLS12Fr(bls12_381.fields.Fr.neg(this.toBigInt()));
  }

  sub(rhs: BLS12Fr) {
    return new BLS12Fr(bls12_381.fields.Fr.sub(this.toBigInt(), rhs.toBigInt()));
  }

  mul(rhs: BLS12Fr) {
    return new BLS12Fr(bls12_381.fields.Fr.mul(this.toBigInt(), rhs.toBigInt()));
  }

  div(rhs: BLS12Fr) {
    return new BLS12Fr(bls12_381.fields.Fr.div(this.toBigInt(), rhs.toBigInt()));
  }

  sqrt() {
    // The noble library throws when the field does not have a sqrt.
    // We would rather have it return null to avoid throwing when (e.g.) checking candidates.
    let res;
    try {
      res = bls12_381.fields.Fr.sqrt(this.toBigInt());
    } catch (error: any) {
      if (error.message.includes('Cannot find square root')) {
        return null;
      } else {
        throw error;
      }
    }
    return new BLS12Fr(res);
  }

  pow(rhs: bigint) {
    return new BLS12Fr(bls12_381.fields.Fr.pow(this.toBigInt(), rhs));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return hexSchemaFor(BLS12Fr);
  }
}

// For deserializing JSON.
TypeRegistry.register('BLS12Fr', BLS12Fr);

/**
 * Fq field class.
 * @dev This class is used to represent elements of BLS12-381 base field.
 */
export class BLS12Fq extends BLS12Field {
  static SIZE_IN_BYTES = bls12_381.fields.Fp.BYTES;
  static MODULUS = bls12_381.fields.Fp.ORDER;
  static ZERO = new BLS12Fq(0n);
  static ONE = new BLS12Fq(1n);
  static MAX_FIELD_VALUE = new BLS12Fq(this.MODULUS - 1n);

  constructor(value: number | bigint | Buffer) {
    super(value);
  }

  [inspect.custom]() {
    return `BLS12Fq<${this.toString()}>`;
  }

  protected modulus() {
    return BLS12Fq.MODULUS;
  }

  protected size() {
    return BLS12Fq.SIZE_IN_BYTES;
  }

  static random() {
    return random(BLS12Fq);
  }

  static zero() {
    return BLS12Fq.ZERO;
  }

  static isZero(value: BLS12Fq) {
    return value.isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, BLS12Fq);
  }

  /**
   * Creates a BLS12Fq instance from a string.
   * @param buf - the string to create a BLS12Fq from.
   * @returns the BLS12Fq instance
   * @remarks if the string only consists of numbers, we assume we are parsing a bigint,
   * otherwise we require the hex string to be prepended with "0x", to ensure there is no misunderstanding
   * as to what is being parsed.
   */
  static fromString(buf: string) {
    if (buf.match(/^\d+$/) !== null) {
      return new BLS12Fq(toBufferBE(BigInt(buf), BLS12Fq.SIZE_IN_BYTES));
    }
    if (buf.match(/^0x/i) !== null) {
      return fromHexString(buf, BLS12Fq);
    }

    throw new Error(`Tried to create a BLS12Fq from an invalid string: ${buf}`);
  }

  /**
   * Creates a BLS12Fq instance from a hex string.
   * @param buf - a hex encoded string.
   * @returns the BLS12Fq instance
   */
  static fromHexString(buf: string) {
    return fromHexString(buf, BLS12Fq);
  }

  /**
   * Constructs a field from noir BigNum type.
   */
  static fromNoirBigNum(bignum: { limbs: string[] }) {
    return fromNoirBigNum(bignum, BLS12Fq);
  }

  /** Arithmetic - wrapper around noble curves */

  add(rhs: BLS12Fq) {
    return new BLS12Fq(bls12_381.fields.Fp.add(this.toBigInt(), rhs.toBigInt()));
  }

  square() {
    return new BLS12Fq(bls12_381.fields.Fp.sqr(this.toBigInt()));
  }

  negate() {
    return new BLS12Fq(bls12_381.fields.Fp.neg(this.toBigInt()));
  }

  sub(rhs: BLS12Fq) {
    return new BLS12Fq(bls12_381.fields.Fp.sub(this.toBigInt(), rhs.toBigInt()));
  }

  mul(rhs: BLS12Fq) {
    return new BLS12Fq(bls12_381.fields.Fp.mul(this.toBigInt(), rhs.toBigInt()));
  }

  div(rhs: BLS12Fq) {
    return new BLS12Fq(bls12_381.fields.Fp.div(this.toBigInt(), rhs.toBigInt()));
  }

  sqrt() {
    // The noble library throws when the field does not have a sqrt.
    // We would rather have it return null to avoid throwing when (e.g.) checking candidates.
    let res;
    try {
      res = bls12_381.fields.Fp.sqrt(this.toBigInt());
    } catch (error: any) {
      if (error.message.includes('Cannot find square root')) {
        return null;
      } else {
        throw error;
      }
    }
    return new BLS12Fq(res);
  }

  pow(rhs: bigint) {
    return new BLS12Fq(bls12_381.fields.Fp.pow(this.toBigInt(), rhs));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    return hexSchemaFor(BLS12Fq);
  }
}

// For deserializing JSON.
TypeRegistry.register('BLS12Fq', BLS12Fq);
