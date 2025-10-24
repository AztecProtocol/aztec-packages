/**
 * Grumpkin elliptic curve operations - delegates to barretenberg/ts implementation.
 * This wrapper maintains the foundation API using Fr and Point types.
 */
import { Grumpkin as GrumpkinImpl } from '@aztec/bb.js/crypto/grumpkin';
import { Bn254Fr } from '@aztec/bb.js/types/fields';
import { GrumpkinPoint } from '@aztec/bb.js/types/points';
import { Fr, type GrumpkinScalar, Point } from '@aztec/foundation/fields';

const grumpkinImpl = new GrumpkinImpl();

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin {
  // prettier-ignore
  static generator = Point.fromBuffer(Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d, 0x63,
    0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18, 0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f, 0x27, 0x2c,
  ]));

  /**
   * Point generator
   * @returns The generator for the curve.
   */
  public generator(): Point {
    return Grumpkin.generator;
  }

  /**
   * Multiplies a point by a scalar (adds the point `scalar` amount of times).
   * @param point - Point to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Result of the multiplication.
   */
  public async mul(point: Point, scalar: GrumpkinScalar): Promise<Point> {
    const grumpkinPoint = GrumpkinPoint.fromBuffer(point.toBuffer());
    const bn254Fr = Bn254Fr.fromBuffer(scalar.toBuffer());
    const result = await grumpkinImpl.mul(grumpkinPoint, bn254Fr);
    return Point.fromBuffer(result.toBuffer());
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public async add(a: Point, b: Point): Promise<Point> {
    const grumpkinA = GrumpkinPoint.fromBuffer(a.toBuffer());
    const grumpkinB = GrumpkinPoint.fromBuffer(b.toBuffer());
    const result = await grumpkinImpl.add(grumpkinA, grumpkinB);
    return Point.fromBuffer(result.toBuffer());
  }

  /**
   * Multiplies a set of points by a scalar.
   * @param points - Points to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Points multiplied by the scalar.
   */
  public async batchMul(points: Point[], scalar: GrumpkinScalar) {
    const grumpkinPoints = points.map(p => GrumpkinPoint.fromBuffer(p.toBuffer()));
    const bn254Fr = Bn254Fr.fromBuffer(scalar.toBuffer());
    const results = await grumpkinImpl.batchMul(grumpkinPoints, bn254Fr);
    return results.map(r => Point.fromBuffer(r.toBuffer()));
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public async getRandomFr(): Promise<Fr> {
    const result = await grumpkinImpl.getRandomFr();
    return Fr.fromBuffer(Buffer.from(result.toBuffer()));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public async reduce512BufferToFr(uint512Buf: Buffer): Promise<Fr> {
    const result = await grumpkinImpl.reduce512BufferToFr(uint512Buf);
    return Fr.fromBuffer(Buffer.from(result.toBuffer()));
  }
}
