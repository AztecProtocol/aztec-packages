import { BarretenbergSync } from '@aztec/bb.js';
import { Fr, type GrumpkinScalar, Point } from '@aztec/foundation/fields';

import { poseidon2Hash } from '../poseidon/index.js';

/**
 * Grumpkin elliptic curve operations.
 * TODO: the functions of the following classes are jumbled and need to be
 * refactored (rearranged): Grumpkin, Point, Fr.
 */
export class Grumpkin {
  static GRUMPKIN_B = new Fr(-17);

  // The sqrt of -3 in Fr.
  static SQRT_NEG_3 = new Fr(8815841940592487684786734430012312169832938914291687956923n);

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
    const api = await BarretenbergSync.initSingleton();
    const [result] = api.getWasm().callWasmExport('ecc_grumpkin__mul', [point.toBuffer(), scalar.toBuffer()], [64]);
    return Point.fromBuffer(Buffer.from(result));
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public async add(a: Point, b: Point): Promise<Point> {
    const api = await BarretenbergSync.initSingleton();
    const [result] = api.getWasm().callWasmExport('ecc_grumpkin__add', [a.toBuffer(), b.toBuffer()], [64]);
    return Point.fromBuffer(Buffer.from(result));
  }

  /**
   * Multiplies a set of points by a scalar.
   * @param points - Points to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Points multiplied by the scalar.
   */
  public async batchMul(points: Point[], scalar: GrumpkinScalar) {
    const concatenatedPoints: Buffer = Buffer.concat(points.map(point => point.toBuffer()));

    const pointsByteLength = points.length * Point.SIZE_IN_BYTES;

    const api = await BarretenbergSync.initSingleton();
    const [result] = api
      .getWasm()
      .callWasmExport(
        'ecc_grumpkin__batch_mul',
        [concatenatedPoints, scalar.toBuffer(), points.length],
        [pointsByteLength],
      );

    const parsedResult: Point[] = [];
    for (let i = 0; i < pointsByteLength; i += 64) {
      parsedResult.push(Point.fromBuffer(Buffer.from(result.subarray(i, i + 64))));
    }
    return parsedResult;
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public async getRandomFr(): Promise<Fr> {
    const api = await BarretenbergSync.initSingleton();
    const [result] = api.getWasm().callWasmExport('ecc_grumpkin__get_random_scalar_mod_circuit_modulus', [], [32]);
    return Fr.fromBuffer(Buffer.from(result));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public async reduce512BufferToFr(uint512Buf: Buffer): Promise<Fr> {
    const api = await BarretenbergSync.initSingleton();
    const [result] = api
      .getWasm()
      .callWasmExport('ecc_grumpkin__reduce512_buffer_mod_circuit_modulus', [uint512Buf], [32]);
    return Fr.fromBuffer(Buffer.from(result));
  }

  /**
   * Helper function used solely by swiftHashToCurve.
   */
  private static async hashTo2FieldsAndABit(msg: Fr[]): Promise<[Fr, Fr, boolean]> {
    // TODO: consider whether we can get away with fewer hashes.
    const m = await poseidon2Hash(msg);
    const [u, t] = await Promise.all([poseidon2Hash([m, 0]), poseidon2Hash([m, 1])]);
    const vField: Fr = await poseidon2Hash([m, 2]);
    const v = Boolean(vField.toBigInt() & 1n);
    return [u, t, v];
  }

  /**
   * SwiftEC https://eprint.iacr.org/2022/759
   * https://hackmd.io/EbRP746JQfGmJFy7D2zNpw?view for the exact notation used here.
   * TODO: consider implementing this in C++.
   */
  public static async swiftHashToCurve(msg: Fr[]): Promise<Point> {
    const b = Grumpkin.GRUMPKIN_B;
    const [u, t, v] = await this.hashTo2FieldsAndABit(msg);
    const u3 = u.mul(u).mul(u);
    const t2 = t.mul(t);
    const two = new Fr(2);
    const x = u3.add(b).sub(t2).div(two.mul(t));
    const y = x.add(t).div(u.mul(Grumpkin.SQRT_NEG_3));
    const twoY = two.mul(y);
    const uOver2 = u.div(two);
    const w = x.div(twoY);
    const x1 = w.sub(uOver2);
    const x2 = w.negate().sub(uOver2);
    const x3 = u.add(twoY.mul(twoY));
    const s1 = x1.mul(x1).mul(x1).add(b);
    const s2 = x2.mul(x2).mul(x2).add(b);
    const s3 = x3.mul(x3).mul(x3).add(b);

    const [maybeY1, maybeY2, maybeY3] = await Promise.all([s1.sqrt(), s2.sqrt(), s3.sqrt()]);

    let finalX: Fr;
    let finalY: Fr;

    if (maybeY1 !== null) {
      finalX = x1;
      finalY = maybeY1;
    } else if (maybeY2 !== null) {
      finalX = x2;
      finalY = maybeY2;
    } else if (maybeY3 !== null) {
      finalX = x3;
      finalY = maybeY3;
    } else {
      throw new Error('swiftHashToCurve error. This should be mathematically unreachable.');
    }

    // We have a problem: the C++ version of sqrt (which this TypeScript code
    // uses) intermittently sometimes computes a different sqrt (the negative)
    // vs the Noir version of sqrt.
    // I'm not sure why the C++ version of Tonelli-Shanks is so complex vs the
    // Noir approach. Anyway, how to resolve this? We choose the sqrt that
    // is <= (p-1)/2.

    // TODO: do this within the typescript sqrt function (a possibly-huge)
    // PR in itself, that will impact many many hard-coded constants.
    // TODO: alternatively change the C++ implementation which is illegibly-
    // complex.
    if (finalY.toBigInt() > (Fr.MODULUS - 1n) / 2n) {
      finalY = finalY.negate();
    }

    // The swiftHashToCurve algorithm then requires us to negate y based on
    // the bool v.
    if (v) {
      finalY = finalY.negate();
    }

    const result = new Point(finalX, finalY, /*isInfinite:*/ false);

    if (!result.isOnGrumpkin()) {
      throw new Error('swiftHashToCurve error. The result is not on the curve. This should be unreachable.');
    }

    return result;
  }
}
