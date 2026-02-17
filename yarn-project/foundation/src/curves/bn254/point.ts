import {
  BN254_G1_GENERATOR,
  BN254_G2_GENERATOR,
  BarretenbergSync,
  type Bn254G1Point as BbApiBn254G1Point,
  type Bn254G2Point as BbApiBn254G2Point,
} from '@aztec/bb.js';

import { Fq, Fr } from './field.js';

/**
 * BN254 G1 point using foundation field classes.
 * Represents a point on the BN254 elliptic curve in affine coordinates.
 */
export class Bn254G1Point {
  constructor(
    public readonly x: Fq,
    public readonly y: Fq,
  ) {}

  private toBbApiPoint(): BbApiBn254G1Point {
    return {
      x: this.x.toBuffer(),
      y: this.y.toBuffer(),
    };
  }

  private static fromBbApiPoint(point: BbApiBn254G1Point): Bn254G1Point {
    return new Bn254G1Point(Fq.fromBuffer(Buffer.from(point.x)), Fq.fromBuffer(Buffer.from(point.y)));
  }

  async isOnCurve(): Promise<boolean> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const apiPoint = this.toBbApiPoint();
    const response = api.bn254G1IsOnCurve({ point: apiPoint });
    return response.isOnCurve;
  }

  /**
   * Get the generator point for BN254 G1, or perform scalar multiplication.
   * When called without arguments, returns the base generator point.
   * When called with a scalar, returns scalar * generator (useful for public key derivation).
   */
  static async generator(scalar?: Fr): Promise<Bn254G1Point> {
    if (!scalar) {
      return new Bn254G1Point(
        Fq.fromBuffer(Buffer.from(BN254_G1_GENERATOR.x)),
        Fq.fromBuffer(Buffer.from(BN254_G1_GENERATOR.y)),
      );
    }

    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const response = api.bn254G1Mul({
      point: BN254_G1_GENERATOR,
      scalar: scalar.toBuffer(),
    });

    return Bn254G1Point.fromBbApiPoint(response.point);
  }

  /**
   * Decompress a BN254 G1 point from compressed form (32 bytes).
   * The compressed format encodes the x-coordinate and the sign bit of the y-coordinate
   * in the most significant bit.
   */
  static async fromCompressed(compressed: Buffer): Promise<Bn254G1Point> {
    if (compressed.length !== 32) {
      throw new Error('Invalid compressed point length');
    }
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const response = api.bn254G1FromCompressed({
      compressed: new Uint8Array(compressed),
    });

    return Bn254G1Point.fromBbApiPoint(response.point);
  }

  /**
   * Compress this BN254 G1 point to 32 bytes.
   * The compressed format encodes the x-coordinate and the sign bit of the y-coordinate
   * in the most significant bit (bit 255).
   */
  compress(): Buffer {
    const xBytes = this.x.toBuffer();
    // Get the least significant bit of y to determine the sign
    const yLsb = this.y.toBigInt() & 1n;
    // If y is odd, set the most significant bit (bit 255) of the output
    if (yLsb === 1n) {
      xBytes[0] |= 0x80;
    }
    return xBytes;
  }

  equals(other: Bn254G1Point): boolean {
    return this.x.equals(other.x) && this.y.equals(other.y);
  }

  toString(): string {
    return `Bn254G1Point(x: ${this.x.toString()}, y: ${this.y.toString()})`;
  }
}

/**
 * BN254 G2 point using foundation field classes.
 * Represents a point on the BN254 G2 curve (twist curve) in affine coordinates.
 * G2 points use extension field coordinates (Fq2).
 */
export class Bn254G2Point {
  constructor(
    public readonly x: [Fq, Fq],
    public readonly y: [Fq, Fq],
  ) {}

  private toBbApiPoint(): BbApiBn254G2Point {
    return {
      x: [this.x[0].toBuffer(), this.x[1].toBuffer()],
      y: [this.y[0].toBuffer(), this.y[1].toBuffer()],
    };
  }

  private static fromBbApiPoint(point: BbApiBn254G2Point): Bn254G2Point {
    return new Bn254G2Point(
      [Fq.fromBuffer(Buffer.from(point.x[0])), Fq.fromBuffer(Buffer.from(point.x[1]))],
      [Fq.fromBuffer(Buffer.from(point.y[0])), Fq.fromBuffer(Buffer.from(point.y[1]))],
    );
  }

  /**
   * Get the generator point for BN254 G2, or perform scalar multiplication.
   * When called without arguments, returns the base generator point.
   * When called with a scalar, returns scalar * generator.
   */
  static async generator(scalar?: Fr): Promise<Bn254G2Point> {
    if (!scalar) {
      return new Bn254G2Point(
        [Fq.fromBuffer(Buffer.from(BN254_G2_GENERATOR.x[0])), Fq.fromBuffer(Buffer.from(BN254_G2_GENERATOR.x[1]))],
        [Fq.fromBuffer(Buffer.from(BN254_G2_GENERATOR.y[0])), Fq.fromBuffer(Buffer.from(BN254_G2_GENERATOR.y[1]))],
      );
    }

    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();

    const response = api.bn254G2Mul({
      point: BN254_G2_GENERATOR as BbApiBn254G2Point,
      scalar: scalar.toBuffer(),
    });

    return Bn254G2Point.fromBbApiPoint(response.point);
  }

  equals(other: Bn254G2Point): boolean {
    return (
      this.x[0].equals(other.x[0]) &&
      this.x[1].equals(other.x[1]) &&
      this.y[0].equals(other.y[0]) &&
      this.y[1].equals(other.y[1])
    );
  }

  toString(): string {
    return `Bn254G2Point(x: (${this.x[0].toString()}, ${this.x[1].toString()}), y: (${this.y[0].toString()}, ${this.y[1].toString()}))`;
  }
}
