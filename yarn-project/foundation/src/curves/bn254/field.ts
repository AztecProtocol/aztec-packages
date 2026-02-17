import { BarretenbergSync } from '@aztec/bb.js';

import { inspect } from 'util';

import { toBigIntBE, toBufferBE } from '../../bigint-buffer/index.js';
import { randomBytes } from '../../crypto/random/index.js';
import { hexSchemaFor } from '../../schemas/utils.js';
import { BufferReader } from '../../serialize/buffer_reader.js';
import { TypeRegistry } from '../../serialize/type_registry.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/**
 * Represents a field derived from BaseField.
 */
type DerivedField<T extends BaseField> = {
  new (value: any): T;
  /**
   * All derived fields will specify a MODULUS.
   */
  MODULUS: bigint;
};

/**
 * Base field class.
 * Uses bigint as the internal representation.
 * Buffers are generated on demand from the bigint value.
 */
abstract class BaseField {
  static SIZE_IN_BYTES = 32;
  private readonly asBigInt: bigint;

  /**
   * Return bigint representation.
   * @deprecated Just to get things compiling. Use toBigInt().
   * */
  get value(): bigint {
    return this.toBigInt();
  }

  /** Returns the size in bytes. */
  get size(): number {
    return BaseField.SIZE_IN_BYTES;
  }

  protected constructor(value: number | bigint | boolean | BaseField | Buffer) {
    if (Buffer.isBuffer(value)) {
      if (value.length > BaseField.SIZE_IN_BYTES) {
        throw new Error(`Value length ${value.length} exceeds ${BaseField.SIZE_IN_BYTES}`);
      }
      this.asBigInt = toBigIntBE(value);
    } else if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
      this.asBigInt = BigInt(value);
    } else if (value instanceof BaseField) {
      this.asBigInt = value.asBigInt;
    } else {
      throw new Error(`Type '${typeof value}' with value '${value}' passed to BaseField ctor.`);
    }

    if (this.asBigInt < 0n) {
      throw new Error(`Value 0x${this.asBigInt.toString(16)} is negative.`);
    } else if (this.asBigInt >= this.modulus()) {
      throw new Error(`Value 0x${this.asBigInt.toString(16)} is greater or equal to field modulus.`);
    }
  }

  protected abstract modulus(): bigint;

  /**
   * Converts the bigint to a Buffer.
   */
  toBuffer(): Buffer {
    return toBufferBE(this.asBigInt, 32);
  }

  toString(): `0x${string}` {
    return `0x${this.asBigInt.toString(16).padStart(64, '0')}`;
  }

  toBigInt(): bigint {
    return this.asBigInt;
  }

  toBool(): boolean {
    return this.asBigInt !== 0n;
  }

  /**
   * Converts this field to a number.
   * Throws if the underlying value is greater than MAX_SAFE_INTEGER.
   */
  toNumber(): number {
    if (this.asBigInt > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Value ${this.asBigInt.toString(16)} greater than than max safe integer`);
    }
    return Number(this.asBigInt);
  }

  /**
   * Converts this field to a number.
   * May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
   */
  toNumberUnsafe(): number {
    return Number(this.asBigInt);
  }

  toShortString(): string {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  equals(rhs: BaseField): boolean {
    return this.asBigInt === rhs.asBigInt;
  }

  lt(rhs: BaseField): boolean {
    return this.asBigInt < rhs.asBigInt;
  }

  cmp(rhs: BaseField): -1 | 0 | 1 {
    const rhsBigInt = rhs.asBigInt;
    return this.asBigInt === rhsBigInt ? 0 : this.asBigInt < rhsBigInt ? -1 : 1;
  }

  static cmp(lhs: BaseField, rhs: BaseField): -1 | 0 | 1 {
    return lhs.cmp(rhs);
  }

  isZero(): boolean {
    return this.asBigInt === 0n;
  }

  isEmpty(): boolean {
    return this.isZero();
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
 * It maybe not read the full 32 bytes if the Buffer is shorter, but it will padded in BaseField constructor.
 */
export function fromBuffer<T extends BaseField>(buffer: Buffer | BufferReader, f: DerivedField<T>) {
  const reader = BufferReader.asReader(buffer);
  return new f(reader.readBytes(BaseField.SIZE_IN_BYTES));
}

/**
 * Constructs a field from a Buffer, but reduces it first, modulo the field modulus.
 * This requires a conversion to a bigint first so the initial underlying representation will be a bigint.
 */
function fromBufferReduce<T extends BaseField>(buffer: Buffer, f: DerivedField<T>) {
  return new f(toBigIntBE(buffer) % f.MODULUS);
}

/**
 * To ensure a field is uniformly random, it's important to reduce a 512 bit value.
 * If you reduced a 256 bit number, there would a be a high skew in the lower range of the field.
 */
function random<T extends BaseField>(f: DerivedField<T>): T {
  return fromBufferReduce(randomBytes(64), f);
}

/**
 * Constructs a field from a 0x prefixed hex string.
 */
function fromHexString<T extends BaseField>(buf: string, f: DerivedField<T>) {
  const withoutPrefix = buf.replace(/^0x/i, '');
  const checked = withoutPrefix.match(/^[0-9A-F]+$/i)?.[0];
  if (checked === undefined) {
    throw new Error(`Invalid hex-encoded string: "${buf}"`);
  }

  const buffer = Buffer.from(checked.length % 2 === 1 ? '0' + checked : checked, 'hex');

  return new f(toBigIntBE(buffer));
}

/** Branding to ensure fields are not interchangeable types. */
export interface Fr {
  /** Brand. */
  _branding: 'Fr';
}

/**
 * Fr field class.
 * @dev This class is used to represent elements of BN254 scalar field or elements in the base field of Grumpkin.
 * (Grumpkin's scalar field corresponds to BN254's base field and vice versa.)
 */
export class Fr extends BaseField {
  static ZERO = new Fr(0n);
  static ONE = new Fr(1n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
  static MAX_FIELD_VALUE = new Fr(this.MODULUS - 1n);

  constructor(value: number | bigint | boolean | Fr | Buffer) {
    super(value);
  }

  [inspect.custom]() {
    return `Fr<${this.toString()}>`;
  }

  protected modulus() {
    return Fr.MODULUS;
  }

  static random() {
    return random(Fr);
  }

  static zero() {
    return Fr.ZERO;
  }

  static isZero(value: Fr) {
    return value.isZero();
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, Fr);
  }

  static fromBufferReduce(buffer: Buffer) {
    return fromBufferReduce(buffer, Fr);
  }

  /**
   * Creates a Fr instance from a string.
   * @param buf - the string to create a Fr from.
   * @returns the Fr instance
   * @remarks if the string only consists of numbers, we assume we are parsing a bigint,
   * otherwise we require the hex string to be prepended with "0x", to ensure there is no misunderstanding
   * as to what is being parsed.
   */
  static fromString(buf: string) {
    if (buf.match(/^\d+$/) !== null) {
      return new Fr(toBufferBE(BigInt(buf), 32));
    }
    if (buf.match(/^0x/i) !== null) {
      return fromHexString(buf, Fr);
    }

    throw new Error(`Tried to create a Fr from an invalid string: ${buf}`);
  }

  /**
   * Creates a Fr instance from a hex string.
   * @param buf - a hex encoded string.
   * @returns the Fr instance
   */
  static fromHexString(buf: string) {
    return fromHexString(buf, Fr);
  }

  /** Arithmetic */

  add(rhs: Fr) {
    return new Fr((this.toBigInt() + rhs.toBigInt()) % Fr.MODULUS);
  }

  square() {
    return new Fr((this.toBigInt() * this.toBigInt()) % Fr.MODULUS);
  }

  negate() {
    return new Fr(Fr.MODULUS - this.toBigInt());
  }

  sub(rhs: Fr) {
    const result = this.toBigInt() - rhs.toBigInt();
    return new Fr(result < 0 ? result + Fr.MODULUS : result);
  }

  mul(rhs: Fr) {
    return new Fr((this.toBigInt() * rhs.toBigInt()) % Fr.MODULUS);
  }

  div(rhs: Fr) {
    if (rhs.isZero()) {
      throw new Error('Division by zero');
    }

    const bInv = modInverse(rhs.toBigInt());
    return this.mul(bInv);
  }

  // Integer division.
  ediv(rhs: Fr) {
    if (rhs.isZero()) {
      throw new Error('Division by zero');
    }

    return new Fr(this.toBigInt() / rhs.toBigInt());
  }

  /**
   * Computes a square root of the field element.
   * @returns A square root of the field element (null if it does not exist).
   */
  async sqrt(): Promise<Fr | null> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.bn254FrSqrt({ input: this.toBuffer() });
    if (!response.isSquareRoot) {
      // Field element is not a quadratic residue mod p so it has no square root.
      return null;
    }
    return Fr.fromBuffer(Buffer.from(response.value));
  }

  toJSON() {
    return this.toString();
  }

  /**
   * Creates an Fr instance from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * Handles buffers, strings, numbers, bigints, or existing instances.
   * @param obj - Plain object, buffer, string, number, bigint, boolean, or Fr instance
   * @returns An Fr instance
   */
  static fromPlainObject(obj: any): Fr {
    if (obj instanceof Fr) {
      return obj;
    }
    return new Fr(obj);
  }

  static get schema() {
    // Serialization from hex string.
    return hexSchemaFor(Fr);
  }
}

// For deserializing JSON.
TypeRegistry.register('Fr', Fr);

/**
 * Branding to ensure fields are not interchangeable types.
 */
export interface Fq {
  /** Brand. */
  _branding: 'Fq';
}

/**
 * Fq field class.
 * @dev This class is used to represent elements of BN254 base field or elements in the scalar field of Grumpkin.
 * (Grumpkin's scalar field corresponds to BN254's base field and vice versa.)
 */
export class Fq extends BaseField {
  static ZERO = new Fq(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
  private static HIGH_SHIFT = BigInt((BaseField.SIZE_IN_BYTES / 2) * 8);
  private static LOW_MASK = (1n << Fq.HIGH_SHIFT) - 1n;

  [inspect.custom]() {
    return `Fq<${this.toString()}>`;
  }

  get lo(): Fr {
    return new Fr(this.toBigInt() & Fq.LOW_MASK);
  }

  get hi(): Fr {
    return new Fr(this.toBigInt() >> Fq.HIGH_SHIFT);
  }

  constructor(value: number | bigint | boolean | Fq | Buffer) {
    super(value);
  }

  protected modulus() {
    return Fq.MODULUS;
  }

  static random() {
    return random(Fq);
  }

  static zero() {
    return Fq.ZERO;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, Fq);
  }

  static fromBufferReduce(buffer: Buffer) {
    return fromBufferReduce(buffer, Fq);
  }

  /**
   * Creates a Fq instance from a string.
   * @param buf - the string to create a Fq from.
   * @returns the Fq instance
   * @remarks if the string only consists of numbers, we assume we are parsing a bigint,
   * otherwise we require the hex string to be prepended with "0x", to ensure there is no misunderstanding
   * as to what is being parsed.
   */
  static fromString(buf: string) {
    if (buf.match(/^\d+$/) !== null) {
      return new Fq(toBufferBE(BigInt(buf), 32));
    }
    if (buf.match(/^0x/i) !== null) {
      return fromHexString(buf, Fq);
    }

    throw new Error(`Tried to create a Fq from an invalid string: ${buf}`);
  }

  /**
   * Creates a Fq instance from a hex string.
   * @param buf - a hex encoded string.
   * @returns the Fq instance
   */
  static fromHexString(buf: string) {
    return fromHexString(buf, Fq);
  }

  static fromHighLow(high: Fr, low: Fr): Fq {
    return new Fq((high.toBigInt() << Fq.HIGH_SHIFT) + low.toBigInt());
  }

  add(rhs: Fq) {
    return new Fq((this.toBigInt() + rhs.toBigInt()) % Fq.MODULUS);
  }

  /**
   * Computes a square root of the field element.
   * @returns A square root of the field element (null if it does not exist).
   */
  async sqrt(): Promise<Fq | null> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.bn254FqSqrt({ input: this.toBuffer() });
    if (!response.isSquareRoot) {
      // Field element is not a quadratic residue mod p so it has no square root.
      return null;
    }
    return Fq.fromBuffer(Buffer.from(response.value));
  }

  toJSON() {
    return this.toString();
  }

  toFields() {
    // The following has to match the order of the limbs in EmbeddedCurveScalar struct in noir::std. This is because
    // this function is used when returning Scalar from the getAddressSecret oracle and in Noir the values get deserialized
    // using the intrinsic serialization of Noir (which follows the order of the fields/members in the struct).
    return [this.lo, this.hi];
  }

  static get schema() {
    return hexSchemaFor(Fq);
  }
}

// For deserializing JSON.
TypeRegistry.register('Fq', Fq);

// Beware: Performance bottleneck below

/**
 * Find the modular inverse of a given element, for BN254 Fr.
 */
function modInverse(b: bigint) {
  const [gcd, x, _] = extendedEuclidean(b, Fr.MODULUS);
  if (gcd != 1n) {
    throw Error('Inverse does not exist');
  }
  // Add modulus if -ve to ensure positive
  return new Fr(x > 0 ? x : x + Fr.MODULUS);
}

/**
 * The extended Euclidean algorithm can be used to find the multiplicative inverse of a field element
 * This is used to perform field division.
 */
function extendedEuclidean(a: bigint, modulus: bigint): [bigint, bigint, bigint] {
  if (a == 0n) {
    return [modulus, 0n, 1n];
  } else {
    const [gcd, x, y] = extendedEuclidean(modulus % a, a);
    return [gcd, y - (modulus / a) * x, x];
  }
}

/** Wraps a function that returns a buffer so that all results are reduced into a field of the given type. */
export function reduceFn<TInput, TField extends BaseField>(fn: (input: TInput) => Buffer, field: DerivedField<TField>) {
  return (input: TInput) => fromBufferReduce(fn(input), field);
}

/** If we are in test mode, we register a special equality for fields. */
if (process.env.NODE_ENV === 'test') {
  const areFieldsEqual = (a: unknown, b: unknown): boolean | undefined => {
    const isAField = a instanceof BaseField;
    const isBField = b instanceof BaseField;

    if (isAField && isBField) {
      return a.equals(b);
    } else if (isAField === isBField) {
      return undefined;
    } else {
      return false;
    }
  };

  if (typeof expect !== 'undefined') {
    // `addEqualityTesters` doesn't seem to be in the types yet.
    (expect as any).addEqualityTesters([areFieldsEqual]);
  } else {
    (globalThis as any).__extraEqualityTesters ??= [];
    (globalThis as any).__extraEqualityTesters.push(areFieldsEqual);
  }
}
