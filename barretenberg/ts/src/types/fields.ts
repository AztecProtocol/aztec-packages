/**
 * Field classes for all supported curves.
 * Each curve has its own Fr (scalar field) and Fq (base field) classes.
 */

import { randomBytes } from '../random/index.js';
import {
  buffer32BytesToBigIntBE,
  uint8ArrayToBigIntBE,
  bigIntToBufferBE,
  bigIntToUint8ArrayBE,
} from '../bigint-array/index.js';
import { BufferReader } from '../serialize/index.js';
import {
  BN254_FR_MODULUS,
  BN254_FQ_MODULUS,
  GRUMPKIN_FR_MODULUS,
  GRUMPKIN_FQ_MODULUS,
  SECP256K1_FR_MODULUS,
  SECP256K1_FQ_MODULUS,
  SECP256R1_FR_MODULUS,
  SECP256R1_FQ_MODULUS,
} from '../cbind/generated/curve_constants.js';

/**
 * Base field class with common functionality
 */
abstract class BaseField {
  static MODULUS: bigint;
  static MAX_VALUE: bigint;
  static SIZE_IN_BYTES = 32;

  private asBuffer?: Buffer;
  private asBigInt?: bigint;

  constructor(value: Uint8Array | Buffer | bigint | number | boolean | BaseField, modulus: bigint) {
    if (value instanceof Buffer || value instanceof Uint8Array) {
      const buf = value instanceof Buffer ? value : Buffer.from(value);
      if (buf.length > BaseField.SIZE_IN_BYTES) {
        throw new Error(`Value length ${buf.length} exceeds ${BaseField.SIZE_IN_BYTES}`);
      }
      this.asBuffer =
        buf.length === BaseField.SIZE_IN_BYTES
          ? buf
          : Buffer.concat([Buffer.alloc(BaseField.SIZE_IN_BYTES - buf.length), buf]);
    } else if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
      this.asBigInt = BigInt(value);
      if (this.asBigInt >= modulus) {
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

  protected static randomBigInt(modulus: bigint): bigint {
    return uint8ArrayToBigIntBE(randomBytes(64)) % modulus;
  }

  static fromBuffer(buffer: any, FieldClass: any) {
    const reader = BufferReader.asReader(buffer);
    return new FieldClass(reader.readBytes(32));
  }

  static fromBufferReduce(buffer: any, modulus: bigint, FieldClass: any) {
    const reader = BufferReader.asReader(buffer);
    return new FieldClass(uint8ArrayToBigIntBE(reader.readBytes(32)) % modulus);
  }

  static fromString(str: string, FieldClass: any, modulus?: string) {
    // Handle pure numeric strings as bigint
    if (str.match(/^\d+$/) !== null) {
      return new FieldClass(BigInt(str));
    }
    // Handle hex strings
    if (str.match(/^0x/i) !== null) {
      return FieldClass.fromBuffer(Buffer.from(str.replace(/^0x/i, ''), 'hex'));
    }
    throw new Error(
      `Tried to create a ${modulus || 'field'} from an invalid string: ${str}`,
    );
  }

  static fromHexString(str: string, FieldClass: any) {
    // Remove 0x prefix if present
    const hex = str.replace(/^0x/i, '');
    // Validate it's a valid hex string
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error('Invalid hex-encoded string');
    }
    return FieldClass.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * We return a copy of the Buffer to ensure this remains immutable.
   */
  toBuffer(): Buffer {
    if (!this.asBuffer) {
      this.asBuffer = bigIntToBufferBE(this.asBigInt!, 32);
    }
    return Buffer.from(this.asBuffer);
  }

  toString(): `0x${string}` {
    return `0x${this.toBuffer().toString('hex')}`;
  }

  toBigInt(): bigint {
    if (this.asBigInt === undefined) {
      this.asBigInt = buffer32BytesToBigIntBE(this.asBuffer!);
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
    if (this.asBuffer) {
      return this.asBuffer.every(v => v === 0);
    }
    return this.asBigInt === 0n;
  }

  isEmpty(): boolean {
    return this.isZero();
  }

  toFriendlyJSON(): string {
    return this.toString();
  }

  toJSON(): string {
    return this.toString();
  }

  toField() {
    return this;
  }

  /** Deprecated - use toBigInt() */
  get value(): bigint {
    return this.toBigInt();
  }

  /** Returns the size in bytes. */
  get size(): number {
    return BaseField.SIZE_IN_BYTES;
  }
}

// ============================================================================
// BN254 Fields
// ============================================================================

/**
 * BN254 Fr field (scalar field)
 */
export class Bn254Fr extends BaseField {
  private readonly __brand: 'Bn254Fr' = 'Bn254Fr';

  static MODULUS = BN254_FR_MODULUS;
  static MAX_VALUE = Bn254Fr.MODULUS - 1n;
  static MAX_FIELD_VALUE = new Bn254Fr(Bn254Fr.MODULUS - 1n);
  static ZERO = new Bn254Fr(0n);
  static ONE = new Bn254Fr(1n);

  constructor(value: Uint8Array | Buffer | bigint | number | boolean | Bn254Fr) {
    super(value, Bn254Fr.MODULUS);
  }

  protected modulus() {
    return Bn254Fr.MODULUS;
  }

  static random() {
    return new Bn254Fr(BaseField.randomBigInt(Bn254Fr.MODULUS));
  }

  static zero() {
    return Bn254Fr.ZERO;
  }

  static isZero(value: Bn254Fr) {
    return value.isZero();
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Bn254Fr) as Bn254Fr;
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Bn254Fr.MODULUS, Bn254Fr) as Bn254Fr;
  }

  static fromString(str: string) {
    return super.fromString(str, Bn254Fr, 'Fr') as Bn254Fr;
  }

  static fromHexString(str: string) {
    return super.fromHexString(str, Bn254Fr) as Bn254Fr;
  }

  /**
   * Convert to GrumpkinFq (trivial conversion since they use the same modulus)
   */
  toGrumpkinFq(): GrumpkinFq {
    return new GrumpkinFq(this.toBuffer());
  }

  /**
   * Create Bn254Fr from GrumpkinFq (trivial conversion since they use the same modulus)
   */
  static fromGrumpkinFq(fq: GrumpkinFq): Bn254Fr {
    return new Bn254Fr(fq.toBuffer());
  }

  /** Arithmetic operations */

  add(rhs: Bn254Fr): Bn254Fr {
    return new Bn254Fr((this.toBigInt() + rhs.toBigInt()) % Bn254Fr.MODULUS);
  }

  sub(rhs: Bn254Fr): Bn254Fr {
    const result = this.toBigInt() - rhs.toBigInt();
    return new Bn254Fr(result < 0 ? result + Bn254Fr.MODULUS : result);
  }

  mul(rhs: Bn254Fr): Bn254Fr {
    return new Bn254Fr((this.toBigInt() * rhs.toBigInt()) % Bn254Fr.MODULUS);
  }

  square(): Bn254Fr {
    return new Bn254Fr((this.toBigInt() * this.toBigInt()) % Bn254Fr.MODULUS);
  }

  negate(): Bn254Fr {
    return new Bn254Fr(Bn254Fr.MODULUS - this.toBigInt());
  }

  div(rhs: Bn254Fr): Bn254Fr {
    if (rhs.isZero()) {
      throw new Error('Division by zero');
    }
    const bInv = modInverseBn254Fr(rhs.toBigInt());
    return this.mul(bInv);
  }

  // Integer division
  ediv(rhs: Bn254Fr): Bn254Fr {
    if (rhs.isZero()) {
      throw new Error('Division by zero');
    }
    return new Bn254Fr(this.toBigInt() / rhs.toBigInt());
  }

  /**
   * Computes a square root of the field element.
   * @returns A square root of the field element (null if it does not exist).
   */
  async sqrt(): Promise<Bn254Fr | null> {
    // Lazy import to avoid circular dependency
    const { BarretenbergSync } = await import('../barretenberg/index.js');
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.bn254FrSqrt({ input: this.toBuffer() });
    if (!response.isSquareRoot) {
      // Field element is not a quadratic residue mod p so it has no square root.
      return null;
    }
    return Bn254Fr.fromBuffer(Buffer.from(response.value));
  }
}

/**
 * BN254 Fq field (base field)
 */
export class Bn254Fq extends BaseField {
  private readonly __brand: 'Bn254Fq' = 'Bn254Fq';

  static MODULUS = BN254_FQ_MODULUS;
  static MAX_VALUE = Bn254Fq.MODULUS - 1n;
  static ZERO = new Bn254Fq(0n);
  private static HIGH_SHIFT = BigInt((BaseField.SIZE_IN_BYTES / 2) * 8);
  private static LOW_MASK = (1n << Bn254Fq.HIGH_SHIFT) - 1n;

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Bn254Fq.MODULUS);
  }

  protected modulus() {
    return Bn254Fq.MODULUS;
  }

  static random() {
    return new Bn254Fq(BaseField.randomBigInt(Bn254Fq.MODULUS));
  }

  static zero() {
    return Bn254Fq.ZERO;
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Bn254Fq) as Bn254Fq;
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Bn254Fq.MODULUS, Bn254Fq) as Bn254Fq;
  }

  static fromString(str: string) {
    return super.fromString(str, Bn254Fq, 'Fq') as Bn254Fq;
  }

  static fromHexString(str: string) {
    return super.fromHexString(str, Bn254Fq) as Bn254Fq;
  }

  static fromHighLow(high: Bn254Fr, low: Bn254Fr): Bn254Fq {
    return new Bn254Fq((high.toBigInt() << Bn254Fq.HIGH_SHIFT) + low.toBigInt());
  }

  get lo(): Bn254Fr {
    return new Bn254Fr(this.toBigInt() & Bn254Fq.LOW_MASK);
  }

  get hi(): Bn254Fr {
    return new Bn254Fr(this.toBigInt() >> Bn254Fq.HIGH_SHIFT);
  }

  add(rhs: Bn254Fq): Bn254Fq {
    return new Bn254Fq((this.toBigInt() + rhs.toBigInt()) % Bn254Fq.MODULUS);
  }

  toFields(): [Bn254Fr, Bn254Fr] {
    // The following has to match the order of the limbs in EmbeddedCurveScalar struct in noir::std. This is because
    // this function is used when returning Scalar from the getAddressSecret oracle and in Noir the values get deserialized
    // using the intrinsic serialization of Noir (which follows the order of the fields/members in the struct).
    return [this.lo, this.hi];
  }

  /**
   * Convert to GrumpkinFr (trivial conversion since they use the same modulus)
   */
  toGrumpkinFr(): GrumpkinFr {
    return new GrumpkinFr(this.toBuffer());
  }

  /**
   * Create Bn254Fq from GrumpkinFr (trivial conversion since they use the same modulus)
   */
  static fromGrumpkinFr(fr: GrumpkinFr): Bn254Fq {
    return new Bn254Fq(fr.toBuffer());
  }
}

// ============================================================================
// Grumpkin Fields
// ============================================================================

/**
 * Grumpkin Fr field (scalar field)
 * Note: Grumpkin's Fr is BN254's Fq
 */
export class GrumpkinFr extends BaseField {
  private readonly __brand: 'GrumpkinFr' = 'GrumpkinFr';

  static MODULUS = GRUMPKIN_FR_MODULUS;
  static MAX_VALUE = GrumpkinFr.MODULUS - 1n;
  static ZERO = new GrumpkinFr(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, GrumpkinFr.MODULUS);
  }

  protected modulus() {
    return GrumpkinFr.MODULUS;
  }

  static random() {
    return new GrumpkinFr(BaseField.randomBigInt(GrumpkinFr.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, GrumpkinFr);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, GrumpkinFr.MODULUS, GrumpkinFr);
  }

  static fromString(str: string) {
    return super.fromString(str, GrumpkinFr);
  }

  /**
   * Convert to Bn254Fq (trivial conversion since they use the same modulus)
   */
  toBn254Fq(): Bn254Fq {
    return new Bn254Fq(this.toBuffer());
  }

  /**
   * Create GrumpkinFr from Bn254Fq (trivial conversion since they use the same modulus)
   */
  static fromBn254Fq(fq: Bn254Fq): GrumpkinFr {
    return new GrumpkinFr(fq.toBuffer());
  }
}

/**
 * Grumpkin Fq field (base field)
 * Note: Grumpkin's Fq is BN254's Fr
 */
export class GrumpkinFq extends BaseField {
  private readonly __brand: 'GrumpkinFq' = 'GrumpkinFq';

  static MODULUS = GRUMPKIN_FQ_MODULUS;
  static MAX_VALUE = GrumpkinFq.MODULUS - 1n;
  static ZERO = new GrumpkinFq(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, GrumpkinFq.MODULUS);
  }

  protected modulus() {
    return GrumpkinFq.MODULUS;
  }

  static random() {
    return new GrumpkinFq(BaseField.randomBigInt(GrumpkinFq.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, GrumpkinFq);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, GrumpkinFq.MODULUS, GrumpkinFq);
  }

  static fromString(str: string) {
    return super.fromString(str, GrumpkinFq);
  }

  /**
   * Convert to Bn254Fr (trivial conversion since they use the same modulus)
   */
  toBn254Fr(): Bn254Fr {
    return new Bn254Fr(this.toBuffer());
  }

  /**
   * Create GrumpkinFq from Bn254Fr (trivial conversion since they use the same modulus)
   */
  static fromBn254Fr(fr: Bn254Fr): GrumpkinFq {
    return new GrumpkinFq(fr.toBuffer());
  }
}

// ============================================================================
// Secp256k1 Fields
// ============================================================================

/**
 * Secp256k1 Fr field (scalar field)
 */
export class Secp256k1Fr extends BaseField {
  private readonly __brand: 'Secp256k1Fr' = 'Secp256k1Fr';

  static MODULUS = SECP256K1_FR_MODULUS;
  static MAX_VALUE = Secp256k1Fr.MODULUS - 1n;
  static ZERO = new Secp256k1Fr(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Secp256k1Fr.MODULUS);
  }

  protected modulus() {
    return Secp256k1Fr.MODULUS;
  }

  static random() {
    return new Secp256k1Fr(BaseField.randomBigInt(Secp256k1Fr.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Secp256k1Fr);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Secp256k1Fr.MODULUS, Secp256k1Fr);
  }

  static fromString(str: string) {
    return super.fromString(str, Secp256k1Fr);
  }
}

/**
 * Secp256k1 Fq field (base field)
 */
export class Secp256k1Fq extends BaseField {
  private readonly __brand: 'Secp256k1Fq' = 'Secp256k1Fq';

  static MODULUS = SECP256K1_FQ_MODULUS;
  static MAX_VALUE = Secp256k1Fq.MODULUS - 1n;
  static ZERO = new Secp256k1Fq(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Secp256k1Fq.MODULUS);
  }

  protected modulus() {
    return Secp256k1Fq.MODULUS;
  }

  static random() {
    return new Secp256k1Fq(BaseField.randomBigInt(Secp256k1Fq.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Secp256k1Fq);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Secp256k1Fq.MODULUS, Secp256k1Fq);
  }

  static fromString(str: string) {
    return super.fromString(str, Secp256k1Fq);
  }
}

// ============================================================================
// Secp256r1 Fields
// ============================================================================

/**
 * Secp256r1 Fr field (scalar field)
 */
export class Secp256r1Fr extends BaseField {
  private readonly __brand: 'Secp256r1Fr' = 'Secp256r1Fr';

  static MODULUS = SECP256R1_FR_MODULUS;
  static MAX_VALUE = Secp256r1Fr.MODULUS - 1n;
  static ZERO = new Secp256r1Fr(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Secp256r1Fr.MODULUS);
  }

  protected modulus() {
    return Secp256r1Fr.MODULUS;
  }

  static random() {
    return new Secp256r1Fr(BaseField.randomBigInt(Secp256r1Fr.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Secp256r1Fr);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Secp256r1Fr.MODULUS, Secp256r1Fr);
  }

  static fromString(str: string) {
    return super.fromString(str, Secp256r1Fr);
  }
}

/**
 * Secp256r1 Fq field (base field)
 */
export class Secp256r1Fq extends BaseField {
  private readonly __brand: 'Secp256r1Fq' = 'Secp256r1Fq';

  static MODULUS = SECP256R1_FQ_MODULUS;
  static MAX_VALUE = Secp256r1Fq.MODULUS - 1n;
  static ZERO = new Secp256r1Fq(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Secp256r1Fq.MODULUS);
  }

  protected modulus() {
    return Secp256r1Fq.MODULUS;
  }

  static random() {
    return new Secp256r1Fq(BaseField.randomBigInt(Secp256r1Fq.MODULUS));
  }

  static fromBuffer(buffer: any) {
    return super.fromBuffer(buffer, Secp256r1Fq);
  }

  static fromBufferReduce(buffer: any) {
    return super.fromBufferReduce(buffer, Secp256r1Fq.MODULUS, Secp256r1Fq);
  }

  static fromString(str: string) {
    return super.fromString(str, Secp256r1Fq);
  }
}

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * Alias for Bn254Fr for backward compatibility.
 * @dev This class is used to represent elements of BN254 scalar field or elements in the base field of Grumpkin.
 * (Grumpkin's scalar field corresponds to BN254's base field and vice versa.)
 */
export const Fr = Bn254Fr;
export type Fr = Bn254Fr;

/**
 * Alias for Bn254Fq for backward compatibility.
 * @dev This class is used to represent elements of BN254 base field or elements in the scalar field of Grumpkin.
 * (Grumpkin's scalar field corresponds to BN254's base field and vice versa.)
 */
export const Fq = Bn254Fq;
export type Fq = Bn254Fq;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the modular inverse of a given element, for BN254 Fr.
 */
function modInverseBn254Fr(b: bigint): Bn254Fr {
  const [gcd, x, _] = extendedEuclidean(b, BN254_FR_MODULUS);
  if (gcd != 1n) {
    throw Error('Inverse does not exist');
  }
  // Add modulus if -ve to ensure positive
  return new Bn254Fr(x > 0 ? x : x + BN254_FR_MODULUS);
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

/** GrumpkinScalar is an Fq (alias for Bn254Fq). */
export type GrumpkinScalar = Fq;
export const GrumpkinScalar = Fq;
