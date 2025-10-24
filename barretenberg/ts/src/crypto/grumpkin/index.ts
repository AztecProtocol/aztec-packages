/**
 * Grumpkin elliptic curve operations using barretenberg bbapi.
 */

import { BarretenbergSync } from '../../barretenberg/index.js';
import { GrumpkinFq, Bn254Fr } from '../../types/fields.js';
import { GrumpkinPoint } from '../../types/points.js';

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin {
  // Grumpkin generator point: (1, y) where y^2 = 1^3 - 17
  static generator = GrumpkinPoint.fromBuffer(
    Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d, 0x63, 0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18,
      0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f, 0x27, 0x2c,
    ]),
  );

  /**
   * Point generator
   * @returns The generator for the curve.
   */
  public generator(): GrumpkinPoint {
    return Grumpkin.generator;
  }

  /**
   * Multiplies a point by a scalar (adds the point `scalar` amount of times).
   * @param point - Point to multiply.
   * @param scalar - Scalar to multiply by (GrumpkinFq = Bn254Fr).
   * @returns Result of the multiplication.
   */
  public async mul(point: GrumpkinPoint, scalar: Bn254Fr): Promise<GrumpkinPoint> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinMul({
      point: { x: point.x.toBuffer(), y: point.y.toBuffer() },
      scalar: scalar.toBuffer(),
    });
    return GrumpkinPoint.fromBuffer(Buffer.concat([Buffer.from(response.point.x), Buffer.from(response.point.y)]));
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public async add(a: GrumpkinPoint, b: GrumpkinPoint): Promise<GrumpkinPoint> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinAdd({
      pointA: { x: a.x.toBuffer(), y: a.y.toBuffer() },
      pointB: { x: b.x.toBuffer(), y: b.y.toBuffer() },
    });
    return GrumpkinPoint.fromBuffer(Buffer.concat([Buffer.from(response.point.x), Buffer.from(response.point.y)]));
  }

  /**
   * Multiplies a set of points by a scalar.
   * @param points - Points to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Points multiplied by the scalar.
   */
  public async batchMul(points: GrumpkinPoint[], scalar: Bn254Fr) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinBatchMul({
      points: points.map(p => ({ x: p.x.toBuffer(), y: p.y.toBuffer() })),
      scalar: scalar.toBuffer(),
    });

    return response.points.map(p =>
      GrumpkinPoint.fromBuffer(Buffer.concat([Buffer.from(p.x), Buffer.from(p.y)])),
    );
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public async getRandomFr(): Promise<Bn254Fr> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinGetRandomFr({ dummy: 0 });
    return Bn254Fr.fromBuffer(Buffer.from(response.value));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public async reduce512BufferToFr(uint512Buf: Buffer): Promise<Bn254Fr> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinReduce512({ input: uint512Buf });
    return Bn254Fr.fromBuffer(Buffer.from(response.value));
  }
}
