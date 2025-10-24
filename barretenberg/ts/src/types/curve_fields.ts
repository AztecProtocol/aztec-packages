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
  value: Uint8Array;

  constructor(value: Uint8Array | Buffer | bigint, modulus: bigint) {
    const valueBigInt =
      typeof value === 'bigint'
        ? value
        : value instanceof Buffer
          ? buffer32BytesToBigIntBE(value)
          : uint8ArrayToBigIntBE(value);

    if (valueBigInt >= modulus) {
      throw new Error(`Value 0x${valueBigInt.toString(16)} is greater or equal to field modulus.`);
    }

    this.value =
      typeof value === 'bigint' ? bigIntToUint8ArrayBE(value) : value instanceof Buffer ? new Uint8Array(value) : value;
  }

  protected static randomBigInt(modulus: bigint): bigint {
    return uint8ArrayToBigIntBE(randomBytes(64)) % modulus;
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader, FieldClass: any) {
    const reader = BufferReader.asReader(buffer);
    return new FieldClass(reader.readBytes(32));
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader, modulus: bigint, FieldClass: any) {
    const reader = BufferReader.asReader(buffer);
    return new FieldClass(uint8ArrayToBigIntBE(reader.readBytes(32)) % modulus);
  }

  static fromString(str: string, FieldClass: any) {
    return FieldClass.fromBuffer(Buffer.from(str.replace(/^0x/i, ''), 'hex'));
  }

  toBuffer() {
    return this.value;
  }

  toString() {
    return '0x' + this.toBuffer().reduce((accumulator, byte) => accumulator + byte.toString(16).padStart(2, '0'), '');
  }

  equals(rhs: BaseField) {
    return this.value.every((v, i) => v === rhs.value[i]);
  }

  isZero() {
    return this.value.every(v => v === 0);
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
  static ZERO = new Bn254Fr(0n);

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Bn254Fr.MODULUS);
  }

  static random() {
    return new Bn254Fr(BaseField.randomBigInt(Bn254Fr.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Bn254Fr);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
    return super.fromBufferReduce(buffer, Bn254Fr.MODULUS, Bn254Fr);
  }

  static fromString(str: string) {
    return super.fromString(str, Bn254Fr);
  }

  /**
   * Convert to GrumpkinFq (trivial conversion since they use the same modulus)
   */
  toGrumpkinFq(): GrumpkinFq {
    return new GrumpkinFq(this.value);
  }

  /**
   * Create Bn254Fr from GrumpkinFq (trivial conversion since they use the same modulus)
   */
  static fromGrumpkinFq(fq: GrumpkinFq): Bn254Fr {
    return new Bn254Fr(fq.value);
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

  constructor(value: Uint8Array | Buffer | bigint) {
    super(value, Bn254Fq.MODULUS);
  }

  static random() {
    return new Bn254Fq(BaseField.randomBigInt(Bn254Fq.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Bn254Fq);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
    return super.fromBufferReduce(buffer, Bn254Fq.MODULUS, Bn254Fq);
  }

  static fromString(str: string) {
    return super.fromString(str, Bn254Fq);
  }

  /**
   * Convert to GrumpkinFr (trivial conversion since they use the same modulus)
   */
  toGrumpkinFr(): GrumpkinFr {
    return new GrumpkinFr(this.value);
  }

  /**
   * Create Bn254Fq from GrumpkinFr (trivial conversion since they use the same modulus)
   */
  static fromGrumpkinFr(fr: GrumpkinFr): Bn254Fq {
    return new Bn254Fq(fr.value);
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

  static random() {
    return new GrumpkinFr(BaseField.randomBigInt(GrumpkinFr.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, GrumpkinFr);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
    return super.fromBufferReduce(buffer, GrumpkinFr.MODULUS, GrumpkinFr);
  }

  static fromString(str: string) {
    return super.fromString(str, GrumpkinFr);
  }

  /**
   * Convert to Bn254Fq (trivial conversion since they use the same modulus)
   */
  toBn254Fq(): Bn254Fq {
    return new Bn254Fq(this.value);
  }

  /**
   * Create GrumpkinFr from Bn254Fq (trivial conversion since they use the same modulus)
   */
  static fromBn254Fq(fq: Bn254Fq): GrumpkinFr {
    return new GrumpkinFr(fq.value);
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

  static random() {
    return new GrumpkinFq(BaseField.randomBigInt(GrumpkinFq.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, GrumpkinFq);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
    return super.fromBufferReduce(buffer, GrumpkinFq.MODULUS, GrumpkinFq);
  }

  static fromString(str: string) {
    return super.fromString(str, GrumpkinFq);
  }

  /**
   * Convert to Bn254Fr (trivial conversion since they use the same modulus)
   */
  toBn254Fr(): Bn254Fr {
    return new Bn254Fr(this.value);
  }

  /**
   * Create GrumpkinFq from Bn254Fr (trivial conversion since they use the same modulus)
   */
  static fromBn254Fr(fr: Bn254Fr): GrumpkinFq {
    return new GrumpkinFq(fr.value);
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

  static random() {
    return new Secp256k1Fr(BaseField.randomBigInt(Secp256k1Fr.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Secp256k1Fr);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
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

  static random() {
    return new Secp256k1Fq(BaseField.randomBigInt(Secp256k1Fq.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Secp256k1Fq);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
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

  static random() {
    return new Secp256r1Fr(BaseField.randomBigInt(Secp256r1Fr.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Secp256r1Fr);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
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

  static random() {
    return new Secp256r1Fq(BaseField.randomBigInt(Secp256r1Fq.MODULUS));
  }

  static fromBuffer(buffer: Uint8Array | Buffer | BufferReader) {
    return super.fromBuffer(buffer, Secp256r1Fq);
  }

  static fromBufferReduce(buffer: Uint8Array | BufferReader) {
    return super.fromBufferReduce(buffer, Secp256r1Fq.MODULUS, Secp256r1Fq);
  }

  static fromString(str: string) {
    return super.fromString(str, Secp256r1Fq);
  }
}

