import { BarretenbergSync } from '@aztec/bb.js';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { Point } from '@aztec/foundation/curves/grumpkin';

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin {
  // prettier-ignore
  static readonly generator = Point.fromBuffer(Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d, 0x63,
    0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18, 0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f, 0x27, 0x2c,
  ]));

  /**
   * Multiplies a point by a scalar (adds the point `scalar` amount of times).
   * @param point - Point to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Result of the multiplication.
   */
  public static async mul(point: Point, scalar: GrumpkinScalar): Promise<Point> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinMul({
      point: { x: point.x.toBuffer(), y: point.y.toBuffer() },
      scalar: scalar.toBuffer(),
    });
    return Point.fromBuffer(Buffer.concat([Buffer.from(response.point.x), Buffer.from(response.point.y)]));
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public static async add(a: Point, b: Point): Promise<Point> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinAdd({
      pointA: { x: a.x.toBuffer(), y: a.y.toBuffer() },
      pointB: { x: b.x.toBuffer(), y: b.y.toBuffer() },
    });
    return Point.fromBuffer(Buffer.concat([Buffer.from(response.point.x), Buffer.from(response.point.y)]));
  }

  /**
   * Multiplies a set of points by a scalar.
   * @param points - Points to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Points multiplied by the scalar.
   */
  public static async batchMul(points: Point[], scalar: GrumpkinScalar) {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinBatchMul({
      points: points.map(p => ({ x: p.x.toBuffer(), y: p.y.toBuffer() })),
      scalar: scalar.toBuffer(),
    });

    return response.points.map(p => Point.fromBuffer(Buffer.concat([Buffer.from(p.x), Buffer.from(p.y)])));
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public static async getRandomFr(): Promise<Fr> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinGetRandomFr({ dummy: 0 });
    return Fr.fromBuffer(Buffer.from(response.value));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public static async reduce512BufferToFr(uint512Buf: Buffer): Promise<Fr> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.grumpkinReduce512({ input: uint512Buf });
    return Fr.fromBuffer(Buffer.from(response.value));
  }
}
