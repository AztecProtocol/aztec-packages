import { BarretenbergSync } from '@aztec/bb.js';
import { Fr, type GrumpkinScalar, Point } from '@aztec/foundation/fields';

/**
 * Grumpkin elliptic curve operations.
 */
export class Grumpkin {
  private wasm = BarretenbergSync.getSingleton().getWasm();

  // TODO(#7386): correctly handle point at infinity in our BB API and nuke Grumpkin.notAPointAtInfinityBuf
  static notAPointAtInfinityBuf = Buffer.from([0x00]);

  // prettier-ignore
  static generator = Point.fromBuffer(Buffer.concat([Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xcf, 0x13, 0x5e, 0x75, 0x06, 0xa4, 0x5d, 0x63,
    0x2d, 0x27, 0x0d, 0x45, 0xf1, 0x18, 0x12, 0x94, 0x83, 0x3f, 0xc4, 0x8d, 0x82, 0x3f, 0x27, 0x2c,
  ]), Grumpkin.notAPointAtInfinityBuf]));

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
  public mul(point: Point, scalar: GrumpkinScalar): Point {
    // TODO(#7386): handle point at infinity
    this.wasm.writeMemory(0, point.toBufferWithoutIsInfinite());
    this.wasm.writeMemory(64, scalar.toBuffer());
    this.wasm.call('ecc_grumpkin__mul', 0, 64, 96);
    // TODO(#7386): handle point at infinity
    return Point.fromBufferWithoutIsInfinite(Buffer.from(this.wasm.getMemorySlice(96, 160)));
  }

  /**
   * Add two points.
   * @param a - Point a in the addition
   * @param b - Point b to add to a
   * @returns Result of the addition.
   */
  public add(a: Point, b: Point): Point {
    // TODO(#7386): handle point at infinity
    this.wasm.writeMemory(0, a.toBufferWithoutIsInfinite());
    // TODO(#7386): handle point at infinity
    this.wasm.writeMemory(64, b.toBufferWithoutIsInfinite());
    this.wasm.call('ecc_grumpkin__add', 0, 64, 128);
    // TODO(#7386): handle point at infinity
    return Point.fromBufferWithoutIsInfinite(Buffer.from(this.wasm.getMemorySlice(128, 192)));
  }

  /**
   * Multiplies a set of points by a scalar.
   * @param points - Points to multiply.
   * @param scalar - Scalar to multiply by.
   * @returns Points multiplied by the scalar.
   */
  public batchMul(points: Point[], scalar: GrumpkinScalar) {
    // TODO(#7386): handle point at infinity
    const concatenatedPoints: Buffer = Buffer.concat(points.map(point => point.toBufferWithoutIsInfinite()));
    const pointsByteLength = points.length * Point.SIZE_IN_BYTES;

    const mem = this.wasm.call('bbmalloc', pointsByteLength * 2);

    this.wasm.writeMemory(mem, concatenatedPoints);
    this.wasm.writeMemory(0, scalar.toBuffer());
    this.wasm.call('ecc_grumpkin__batch_mul', mem, 0, points.length, mem + pointsByteLength);

    const result: Buffer = Buffer.from(
      this.wasm.getMemorySlice(mem + pointsByteLength, mem + pointsByteLength + pointsByteLength),
    );
    this.wasm.call('bbfree', mem);

    const parsedResult: Point[] = [];
    for (let i = 0; i < pointsByteLength; i += 64) {
      // TODO(#7386): handle point at infinity
      parsedResult.push(Point.fromBufferWithoutIsInfinite(result.subarray(i, i + 64)));
    }
    return parsedResult;
  }

  /**
   * Gets a random field element.
   * @returns Random field element.
   */
  public getRandomFr(): Fr {
    this.wasm.call('ecc_grumpkin__get_random_scalar_mod_circuit_modulus', 0);
    return Fr.fromBuffer(Buffer.from(this.wasm.getMemorySlice(0, 32)));
  }

  /**
   * Converts a 512 bits long buffer to a field.
   * @param uint512Buf - The buffer to convert.
   * @returns Buffer representation of the field element.
   */
  public reduce512BufferToFr(uint512Buf: Buffer): Fr {
    this.wasm.writeMemory(0, uint512Buf);
    this.wasm.call('ecc_grumpkin__reduce512_buffer_mod_circuit_modulus', 0, 64);
    return Fr.fromBuffer(Buffer.from(this.wasm.getMemorySlice(64, 96)));
  }
}
