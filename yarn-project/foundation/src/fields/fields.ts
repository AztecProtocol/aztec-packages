import { BarretenbergSync } from '@aztec/bb.js';

import { inspect } from 'util';

import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/random/index.js';
import { hexSchemaFor } from '../schemas/utils.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { TypeRegistry } from '../serialize/type_registry.js';

const ZERO_BUFFER = Buffer.alloc(32);

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
 * Abstract base class for field elements in the Aztec protocol.
 *
 * This class provides the foundation for field arithmetic in the BN254 elliptic curve system
 * used by Aztec. Field elements are the fundamental building blocks for cryptographic operations,
 * representing values modulo a prime number (the field modulus).
 *
 * The class implements lazy conversion between Buffer and BigInt representations to optimize
 * performance. Conversions are cached to avoid repeated expensive operations.
 *
 * @remarks
 * ## Performance Optimization
 * - Values can be constructed from either Buffer or BigInt
 * - Conversions are performed lazily and cached
 * - Buffer-to-BigInt and BigInt-to-Buffer conversions are expensive and should be minimized
 *
 * ## Modulus Checking
 * - When constructed from BigInt, values are validated to be within the field modulus
 * - When constructed from Buffer, validation is deferred until conversion to BigInt (if needed)
 * - This allows efficient buffer operations without unnecessary validations
 *
 * ## Immutability
 * - Field elements are immutable
 * - All operations return new instances
 * - Internal representations are protected from external modification
 *
 * @see {@link Fr} - Scalar field of BN254 (and base field of Grumpkin)
 * @see {@link Fq} - Base field of BN254 (and scalar field of Grumpkin)
 */
abstract class BaseField {
  static SIZE_IN_BYTES = 32;
  private asBuffer?: Buffer;
  private asBigInt?: bigint;

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
      this.asBuffer =
        value.length === BaseField.SIZE_IN_BYTES
          ? value
          : Buffer.concat([Buffer.alloc(BaseField.SIZE_IN_BYTES - value.length), value]);
    } else if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
      this.asBigInt = BigInt(value);
      if (this.asBigInt >= this.modulus()) {
        throw new Error(`Value 0x${this.asBigInt.toString(16)} is greater or equal to field modulus.`);
      } else if (this.asBigInt < 0n) {
        throw new Error(`Value 0x${this.asBigInt.toString(16)} is negative.`);
      }
    } else if (value instanceof BaseField) {
      this.asBuffer = value.asBuffer;
      this.asBigInt = value.asBigInt;
    } else {
      throw new Error(`Type '${typeof value}' with value '${value}' passed to BaseField ctor.`);
    }
  }

  protected abstract modulus(): bigint;

  /**
   * We return a copy of the Buffer to ensure this remains immutable.
   */
  toBuffer(): Buffer {
    if (!this.asBuffer) {
      this.asBuffer = toBufferBE(this.asBigInt!, 32);
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

  toBool(): boolean {
    return Boolean(this.toBigInt());
  }

  /**
   * Converts this field to a number.
   * Throws if the underlying value is greater than MAX_SAFE_INTEGER.
   */
  toNumber(): number {
    const value = this.toBigInt();
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Value ${value.toString(16)} greater than than max safe integer`);
    }
    return Number(value);
  }

  /**
   * Converts this field to a number.
   * May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
   */
  toNumberUnsafe(): number {
    const value = this.toBigInt();
    return Number(value);
  }

  toShortString(): string {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  equals(rhs: BaseField): boolean {
    return this.toBuffer().equals(rhs.toBuffer());
  }

  lt(rhs: BaseField): boolean {
    return this.toBigInt() < rhs.toBigInt();
  }

  cmp(rhs: BaseField): -1 | 0 | 1 {
    const lhsBigInt = this.toBigInt();
    const rhsBigInt = rhs.toBigInt();
    return lhsBigInt === rhsBigInt ? 0 : lhsBigInt < rhsBigInt ? -1 : 1;
  }

  isZero(): boolean {
    return this.toBuffer().equals(ZERO_BUFFER);
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

  return new f(buffer);
}

/** Branding to ensure fields are not interchangeable types. */
export interface Fr {
  /** Brand. */
  _branding: 'Fr';
}

/**
 * Field element in the BN254 scalar field (Fr).
 *
 * Fr represents elements in the scalar field of the BN254 elliptic curve, which has a prime order.
 * This field is used for:
 * - Scalar multiplication on BN254 curve points
 * - Field arithmetic in zero-knowledge circuits
 * - Base field elements for the Grumpkin curve
 *
 * The field modulus is: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
 * (approximately 2^254)
 *
 * @example
 * ```typescript
 * // Create from various types
 * const zero = Fr.ZERO;
 * const one = Fr.ONE;
 * const fromNum = new Fr(42);
 * const fromBigInt = new Fr(123456789n);
 * const fromHex = Fr.fromString("0x1234");
 * const random = Fr.random();
 *
 * // Arithmetic operations
 * const a = new Fr(10);
 * const b = new Fr(20);
 * const sum = a.add(b);      // 30
 * const diff = a.sub(b);     // Field element representing -10 (mod MODULUS)
 * const product = a.mul(b);  // 200
 * const quotient = b.div(a); // 2
 *
 * // Conversions
 * const buffer = a.toBuffer();  // 32-byte buffer
 * const bigint = a.toBigInt();  // BigInt value
 * const num = a.toNumber();     // JavaScript number (throws if too large)
 * const hex = a.toString();     // "0x..." hex string
 *
 * // Comparisons
 * if (a.equals(b)) { }
 * if (a.isZero()) { }
 * if (a.lt(b)) { }
 * ```
 *
 * @remarks
 * ## Field Properties
 * - Modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
 * - This is the order of the scalar field of BN254 (alt_bn128)
 * - Also the base field modulus of the Grumpkin curve
 *
 * ## Arithmetic
 * - All operations are performed modulo the field modulus
 * - Division is implemented via modular multiplicative inverse
 * - Square root computation uses the Barretenberg backend
 *
 * ## Special Values
 * - Fr.ZERO: The additive identity (0)
 * - Fr.ONE: The multiplicative identity (1)
 * - Fr.MAX_FIELD_VALUE: The largest valid field element (MODULUS - 1)
 *
 * ## Serialization
 * - Native JSON serialization to hex strings
 * - Buffer serialization (32 bytes, big-endian)
 * - Compatible with Noir and circuit representations
 *
 * @see {@link Fq} - The base field of BN254
 * @see {@link GrumpkinScalar} - Type alias for Fq when used as Grumpkin's scalar field
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
    const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
    const wasm = api.getWasm();
    const [buf] = wasm.callWasmExport('bn254_fr_sqrt', [this.toBuffer()], [Fr.SIZE_IN_BYTES + 1]);
    const isSqrt = buf[0] === 1;
    if (!isSqrt) {
      // Field element is not a quadratic residue mod p so it has no square root.
      return null;
    }
    return new Fr(Buffer.from(buf.slice(1)));
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
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
 * Field element in the BN254 base field (Fq).
 *
 * Fq represents elements in the base field of the BN254 elliptic curve. This field is used for:
 * - Coordinates of points on the BN254 curve (x and y coordinates)
 * - Scalar field elements for the Grumpkin curve
 * - Extended precision arithmetic requiring 256 bits
 *
 * The field modulus is: 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
 * (approximately 2^254)
 *
 * @example
 * ```typescript
 * // Create from various types
 * const zero = Fq.ZERO;
 * const fromNum = new Fq(42);
 * const fromBigInt = new Fq(123456789n);
 * const fromHex = Fq.fromString("0x1234");
 * const random = Fq.random();
 *
 * // Split into high/low 128-bit limbs
 * const value = new Fq(0x123456789abcdef0n);
 * const lo = value.lo;  // Lower 128 bits as Fr
 * const hi = value.hi;  // Upper 128 bits as Fr
 *
 * // Reconstruct from limbs
 * const reconstructed = Fq.fromHighLow(hi, lo);
 * // reconstructed.equals(value) === true
 *
 * // Convert to field array (for Noir compatibility)
 * const fields = value.toFields();  // [lo, hi] as Fr[]
 *
 * // Arithmetic (basic operations)
 * const a = new Fq(100);
 * const b = new Fq(50);
 * const sum = a.add(b);  // 150
 * ```
 *
 * @remarks
 * ## Field Properties
 * - Modulus: 21888242871839275222246405745257275088696311157297823662689037894645226208583
 * - This is the base field modulus of BN254 (alt_bn128)
 * - Also the scalar field modulus of the Grumpkin curve
 * - Slightly larger than Fr's modulus
 *
 * ## High/Low Limb Representation
 * - Fq values can be split into two 128-bit limbs (high and low)
 * - This is useful for circuits that process 256-bit values in two parts
 * - The `lo` and `hi` properties return Fr elements (which fit in 254 bits)
 * - The `toFields()` method returns [lo, hi] for Noir compatibility
 *
 * ## Use Cases
 * - Grumpkin scalar field operations (signing, key derivation)
 * - BN254 curve point coordinates
 * - Extended precision arithmetic in circuits
 * - Ethereum address compatibility (addresses are derived using Fq arithmetic)
 *
 * ## Relationship to Fr
 * - Fq and Fr are different fields with different moduli
 * - BN254's base field (Fq) = Grumpkin's scalar field
 * - BN254's scalar field (Fr) = Grumpkin's base field
 * - This relationship enables efficient pairing-based cryptography
 *
 * @see {@link Fr} - The scalar field of BN254
 * @see {@link GrumpkinScalar} - Type alias for Fq when used as Grumpkin's scalar field
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

/**
 * GrumpkinScalar is an Fq.
 * @remarks Called GrumpkinScalar because it is used to represent elements in Grumpkin's scalar field as defined in
 *          the Aztec Protocol Specs.
 */
export type GrumpkinScalar = Fq;
export const GrumpkinScalar = Fq;

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
