/**
 * Point classes for all supported curves.
 * Each curve has its own point class with curve-specific operations.
 */

import { Bn254Fr, Bn254Fq, GrumpkinFr, GrumpkinFq, Secp256k1Fr, Secp256k1Fq, Secp256r1Fr, Secp256r1Fq } from './fields.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { poseidon2Hash } from '../crypto/poseidon/index.js';
import { randomBytes } from '../random/index.js';
import { uint8ArrayToBigIntBE } from '../bigint-array/index.js';

/**
 * Error thrown when trying to create a point that is not on the curve.
 */
export class NotOnCurveError extends Error {
  constructor(x: string, curveName: string) {
    super(`The given x-coordinate is not on the ${curveName} curve: ${x}`);
    this.name = 'NotOnCurveError';
  }
}

// ============================================================================
// Grumpkin Point (curve equation: y^2 = x^3 - 17)
// ============================================================================

/**
 * Represents a Point on the Grumpkin elliptic curve.
 * Grumpkin uses curve equation: y^2 = x^3 - 17
 * Field: GrumpkinFq (which is Bn254Fr)
 */
export class GrumpkinPoint {
  static ZERO = new GrumpkinPoint(GrumpkinFq.ZERO, GrumpkinFq.ZERO, false);
  static SIZE_IN_BYTES = GrumpkinFq.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = GrumpkinFq.SIZE_IN_BYTES;

  /** Used to differentiate this class from other types */
  public readonly kind = 'grumpkin-point';

  constructor(
    public readonly x: GrumpkinFq,
    public readonly y: GrumpkinFq,
    public readonly isInfinite: boolean = false,
  ) {}

  /**
   * Generate a random Point instance.
   */
  static async random() {
    while (true) {
      try {
        const randomBit = (randomBytes(1)[0] & 1) === 1;
        return await GrumpkinPoint.fromXAndSign(GrumpkinFq.random(), randomBit);
      } catch (e: any) {
        if (!(e instanceof NotOnCurveError)) {
          throw e;
        }
        continue;
      }
    }
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(GrumpkinFq.fromBuffer(reader), GrumpkinFq.fromBuffer(reader), false);
  }

  static async fromCompressedBuffer(buffer: Buffer | BufferReader): Promise<GrumpkinPoint> {
    const reader = BufferReader.asReader(buffer);
    const bytes = reader.readBytes(GrumpkinPoint.COMPRESSED_SIZE_IN_BYTES);

    const sign = (bytes[0] & 0x80) !== 0;
    bytes[0] &= 0x7f;
    const x = GrumpkinFq.fromBuffer(bytes);

    return this.fromXAndSign(x, sign);
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/i, '');
    return this.fromBuffer(Buffer.from(hex, 'hex'));
  }

  toFields() {
    return [this.x, this.y, new GrumpkinFq(this.isInfinite ? 1n : 0n)];
  }

  /**
   * Uses the x coordinate and sign flag to reconstruct the point.
   * For Grumpkin: y^2 = x^3 - 17
   */
  static async fromXAndSign(x: GrumpkinFq, sign: boolean) {
    const y = await GrumpkinPoint.YFromX(x);
    if (y == null) {
      throw new NotOnCurveError(x.toString(), 'Grumpkin');
    }

    const yBigInt = uint8ArrayToBigIntBE(y.toBuffer());
    const yPositiveBigInt = yBigInt <= (GrumpkinFq.MODULUS - 1n) / 2n ? yBigInt : GrumpkinFq.MODULUS - yBigInt;
    const yNegativeBigInt = GrumpkinFq.MODULUS - yPositiveBigInt;

    const finalY = new GrumpkinFq(sign ? yPositiveBigInt : yNegativeBigInt);
    return new this(x, finalY, false);
  }

  /**
   * Derive the y coordinate from the x coordinate on the Grumpkin curve.
   * Grumpkin: y^2 = x^3 - 17
   */
  static async YFromX(x: GrumpkinFq): Promise<GrumpkinFq | null> {
    const xBigInt = uint8ArrayToBigIntBE(x.toBuffer());
    const xSquared = (xBigInt * xBigInt) % GrumpkinFq.MODULUS;
    const xCubed = (xSquared * xBigInt) % GrumpkinFq.MODULUS;
    const ySquared = (xCubed - 17n + GrumpkinFq.MODULUS) % GrumpkinFq.MODULUS;

    // Convert to Bn254Fr for sqrt (since GrumpkinFq = Bn254Fr)
    const ySquaredFr = x.toBn254Fr();
    const yFr = await ySquaredFr.sqrt();
    if (yFr === null) {
      return null;
    }
    return GrumpkinFq.fromBn254Fr(yFr);
  }

  toXAndSign(): [GrumpkinFq, boolean] {
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());
    return [this.x, yBigInt <= (GrumpkinFq.MODULUS - 1n) / 2n];
  }

  toBuffer() {
    if (this.isInfinite) {
      throw new Error('Cannot serialize infinite point');
    }
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  toCompressedBuffer() {
    const [x, sign] = this.toXAndSign();
    const xBigInt = uint8ArrayToBigIntBE(x.toBuffer());
    const compressedValue = xBigInt + (sign ? 2n ** 255n : 0n);

    const buf = Buffer.alloc(GrumpkinPoint.COMPRESSED_SIZE_IN_BYTES);
    const hex = compressedValue.toString(16).padStart(64, '0');
    Buffer.from(hex, 'hex').copy(buf);

    return buf;
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  equals(rhs: GrumpkinPoint) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y) && this.isInfinite === rhs.isInfinite;
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  async hash() {
    return poseidon2Hash(this.toFields());
  }

  get inf() {
    return this.isInfinite;
  }

  /**
   * Check if this point is on the Grumpkin curve: y^2 = x^3 - 17
   */
  isOnCurve() {
    if (this.inf) {
      return true;
    }

    const xBigInt = uint8ArrayToBigIntBE(this.x.toBuffer());
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());

    const lhs = (yBigInt * yBigInt) % GrumpkinFq.MODULUS;
    const xSquared = (xBigInt * xBigInt) % GrumpkinFq.MODULUS;
    const xCubed = (xSquared * xBigInt) % GrumpkinFq.MODULUS;
    const rhs = (xCubed - 17n + GrumpkinFq.MODULUS) % GrumpkinFq.MODULUS;

    return lhs === rhs;
  }

  toJSON() {
    return this.toString();
  }
}

// ============================================================================
// BN254 G1 Point (curve equation: y^2 = x^3 + 3)
// ============================================================================

/**
 * Represents a Point on the BN254 G1 curve.
 * BN254: y^2 = x^3 + 3
 * Field: Bn254Fq
 */
export class Bn254G1Point {
  static ZERO = new Bn254G1Point(Bn254Fq.ZERO, Bn254Fq.ZERO, false);
  static SIZE_IN_BYTES = Bn254Fq.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Bn254Fq.SIZE_IN_BYTES;

  public readonly kind = 'bn254-g1-point';

  constructor(
    public readonly x: Bn254Fq,
    public readonly y: Bn254Fq,
    public readonly isInfinite: boolean = false,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Bn254Fq.fromBuffer(reader), Bn254Fq.fromBuffer(reader), false);
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/i, '');
    return this.fromBuffer(Buffer.from(hex, 'hex'));
  }

  toBuffer() {
    if (this.isInfinite) {
      throw new Error('Cannot serialize infinite point');
    }
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  equals(rhs: Bn254G1Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y) && this.isInfinite === rhs.isInfinite;
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  get inf() {
    return this.isInfinite;
  }

  /**
   * Check if this point is on the BN254 curve: y^2 = x^3 + 3
   */
  isOnCurve() {
    if (this.inf) {
      return true;
    }

    const xBigInt = uint8ArrayToBigIntBE(this.x.toBuffer());
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());

    const lhs = (yBigInt * yBigInt) % Bn254Fq.MODULUS;
    const xSquared = (xBigInt * xBigInt) % Bn254Fq.MODULUS;
    const xCubed = (xSquared * xBigInt) % Bn254Fq.MODULUS;
    const rhs = (xCubed + 3n) % Bn254Fq.MODULUS;

    return lhs === rhs;
  }

  toJSON() {
    return this.toString();
  }
}

// ============================================================================
// Secp256k1 Point (curve equation: y^2 = x^3 + 7)
// ============================================================================

/**
 * Represents a Point on the Secp256k1 curve.
 * Secp256k1: y^2 = x^3 + 7
 * Field: Secp256k1Fq
 */
export class Secp256k1Point {
  static ZERO = new Secp256k1Point(Secp256k1Fq.ZERO, Secp256k1Fq.ZERO, false);
  static SIZE_IN_BYTES = Secp256k1Fq.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Secp256k1Fq.SIZE_IN_BYTES;

  public readonly kind = 'secp256k1-point';

  constructor(
    public readonly x: Secp256k1Fq,
    public readonly y: Secp256k1Fq,
    public readonly isInfinite: boolean = false,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Secp256k1Fq.fromBuffer(reader), Secp256k1Fq.fromBuffer(reader), false);
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/i, '');
    return this.fromBuffer(Buffer.from(hex, 'hex'));
  }

  toBuffer() {
    if (this.isInfinite) {
      throw new Error('Cannot serialize infinite point');
    }
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  equals(rhs: Secp256k1Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y) && this.isInfinite === rhs.isInfinite;
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  get inf() {
    return this.isInfinite;
  }

  /**
   * Check if this point is on the Secp256k1 curve: y^2 = x^3 + 7
   */
  isOnCurve() {
    if (this.inf) {
      return true;
    }

    const xBigInt = uint8ArrayToBigIntBE(this.x.toBuffer());
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());

    const lhs = (yBigInt * yBigInt) % Secp256k1Fq.MODULUS;
    const xSquared = (xBigInt * xBigInt) % Secp256k1Fq.MODULUS;
    const xCubed = (xSquared * xBigInt) % Secp256k1Fq.MODULUS;
    const rhs = (xCubed + 7n) % Secp256k1Fq.MODULUS;

    return lhs === rhs;
  }

  toJSON() {
    return this.toString();
  }
}

// ============================================================================
// Secp256r1 Point (curve equation: y^2 = x^3 - 3x + b)
// ============================================================================

/**
 * Represents a Point on the Secp256r1 (P-256) curve.
 * Secp256r1: y^2 = x^3 - 3x + b where
 * b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
 * Field: Secp256r1Fq
 */
export class Secp256r1Point {
  static ZERO = new Secp256r1Point(Secp256r1Fq.ZERO, Secp256r1Fq.ZERO, false);
  static SIZE_IN_BYTES = Secp256r1Fq.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Secp256r1Fq.SIZE_IN_BYTES;

  // Secp256r1 curve parameter b
  static B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

  public readonly kind = 'secp256r1-point';

  constructor(
    public readonly x: Secp256r1Fq,
    public readonly y: Secp256r1Fq,
    public readonly isInfinite: boolean = false,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Secp256r1Fq.fromBuffer(reader), Secp256r1Fq.fromBuffer(reader), false);
  }

  static fromString(str: string) {
    const hex = str.replace(/^0x/i, '');
    return this.fromBuffer(Buffer.from(hex, 'hex'));
  }

  toBuffer() {
    if (this.isInfinite) {
      throw new Error('Cannot serialize infinite point');
    }
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  toString() {
    return '0x' + this.toBuffer().toString('hex');
  }

  equals(rhs: Secp256r1Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y) && this.isInfinite === rhs.isInfinite;
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  get inf() {
    return this.isInfinite;
  }

  /**
   * Check if this point is on the Secp256r1 curve: y^2 = x^3 - 3x + b
   */
  isOnCurve() {
    if (this.inf) {
      return true;
    }

    const xBigInt = uint8ArrayToBigIntBE(this.x.toBuffer());
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());

    const lhs = (yBigInt * yBigInt) % Secp256r1Fq.MODULUS;
    const xSquared = (xBigInt * xBigInt) % Secp256r1Fq.MODULUS;
    const xCubed = (xSquared * xBigInt) % Secp256r1Fq.MODULUS;
    const minusThreeX = (Secp256r1Fq.MODULUS - ((3n * xBigInt) % Secp256r1Fq.MODULUS)) % Secp256r1Fq.MODULUS;
    const rhs = (xCubed + minusThreeX + Secp256r1Point.B) % Secp256r1Fq.MODULUS;

    return lhs === rhs;
  }

  toJSON() {
    return this.toString();
  }
}

