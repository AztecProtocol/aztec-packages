import type { ProjPointType } from '@noble/curves/abstract/weierstrass';
/* eslint-disable camelcase */
import { bls12_381 } from '@noble/curves/bls12-381';
import { inspect } from 'util';

import { toBufferBE } from '../bigint-buffer/index.js';
import { randomBoolean } from '../crypto/random/index.js';
import { hexSchemaFor } from '../schemas/utils.js';
import { BufferReader, serializeToBuffer } from '../serialize/index.js';
import { bufferToHex, hexToBuffer } from '../string/index.js';
import { BLS12Fq, BLS12Fr } from './bls12_fields.js';
import { Fr } from './fields.js';

/**
 * Represents a Point on an elliptic curve with x and y coordinates.
 * The Point class provides methods for creating instances from different input types,
 * converting instances to various output formats, and checking the equality of points.
 * TODO(#7386): Clean up this class.
 */
export class BLS12Point {
  static ZERO = new BLS12Point(BLS12Fq.ZERO, BLS12Fq.ZERO, true);
  static ONE = new BLS12Point(new BLS12Fq(bls12_381.G1.CURVE.Gx), new BLS12Fq(bls12_381.G1.CURVE.Gy), false);
  static SIZE_IN_BYTES = BLS12Fq.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = BLS12Fq.SIZE_IN_BYTES;
  static COMPRESSED_ZERO = setMask(Buffer.alloc(BLS12Fq.SIZE_IN_BYTES), { infinity: true, compressed: true });

  constructor(
    /**
     * The point's x coordinate
     */
    public readonly x: BLS12Fq,
    /**
     * The point's y coordinate
     */
    public readonly y: BLS12Fq,
    /**
     * Whether the point is at infinity
     */
    public readonly isInfinite: boolean,
  ) {
    if (!BLS12Point.isOnCurve(x, y)) {
      throw new BLSPointNotOnCurveError(x, y);
    }
    if (isInfinite && !(x.equals(BLS12Fq.ZERO) && y.equals(BLS12Fq.ZERO))) {
      throw new Error(`BLS12-381 G1 point ( ${x.toString()}, ${y.toString()} ) is not infinite.`);
    }
  }

  toJSON() {
    return this.toString();
  }

  [inspect.custom]() {
    return `BLS12Point {
      x: ${inspect(this.x)},
      y: ${inspect(this.y)},
      isInfinite: ${inspect(this.isInfinite)},
    }`;
  }

  static get schema() {
    return hexSchemaFor(BLS12Point);
  }

  /**
   * Generate a random Point instance.
   *
   * @returns A randomly generated Point instance.
   */
  static random() {
    while (true) {
      try {
        return BLS12Point.fromXAndSign(BLS12Fq.random(), randomBoolean());
      } catch (e: any) {
        if (!(e instanceof BLSPointNotOnCurveError)) {
          throw e;
        }
        // The random point is not on the curve - we try again
        continue;
      }
    }
  }

  /**
   * Create a Point instance from a given buffer or BufferReader.
   * The input 'buffer' should have exactly 96 bytes representing the x and y coordinates.
   *
   * @param buffer - The buffer or BufferReader containing the x and y coordinates of the point.
   * @returns A Point instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const [x, y] = [BLS12Fq.fromBuffer(reader), BLS12Fq.fromBuffer(reader)];
    return new this(x, y, x.isZero() && y.isZero());
  }

  /**
   * Create a Point instance from a hex-encoded string.
   * The input should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates.
   * Throws an error if the input length is invalid or coordinate values are out of range.
   *
   * @param str - The hex-encoded string representing the Point coordinates.
   * @returns A Point instance.
   */
  static fromString(str: string) {
    return this.fromBuffer(hexToBuffer(str));
  }

  /**
   * Create a compressed buffer instance from a point.
   * @dev NOTE: The compression standard for BLS12-381 differs from BN curves. Instead of
   * one is_positive flag, we have three flags to prepend:
   * - is_compressed: indicator that the point is compressed
   * - is_infinity: whether the point the point at infinity
   * - is_greater: only set if is_compressed && !is_infinity && y > (p - 1)/2
   * See https://github.com/arkworks-rs/algebra/blob/master/curves/bls12_381/src/curves/g1.rs -> serialize_with_mode() -> encoding
   * and noble-curves/src/bls12-381.ts -> setMask()
   * @dev Most of the logic below is taken from noble-curves/src/bls12-381.ts -> toBytes()
   * @param point A BLS12Point instance.
   * @returns The buffer containing the x coordinate and the flags of the y coordinate.
   */
  compress(): Buffer {
    if (this.isZero()) {
      return BLS12Point.COMPRESSED_ZERO;
    }
    const isGreater = this.y.isNegative();
    return setMask(toBufferBE(this.x.toBigInt(), BLS12Fq.SIZE_IN_BYTES), { compressed: true, sort: isGreater });
  }

  /**
   * Create a Point instance from a compressed buffer.
   * @dev See compress() above for compression encoding for BLS12-381.
   * @dev Most of the logic below is taken from noble-curves/src/bls12-381.ts -> fromBytes()
   * @param buffer - The buffer containing the x coordinate and the flags of the y coordinate.
   * @returns A BLS12Point instance.
   */
  static decompress(buffer: Buffer): BLS12Point {
    const { compressed, infinity, sort, value: decompressed } = parseMask(buffer);
    if (decompressed.length === BLS12Fq.SIZE_IN_BYTES && compressed) {
      const x = new BLS12Fq(decompressed);
      if (infinity) {
        if (!x.isZero()) {
          throw new Error('Non-empty compressed G1 point at infinity');
        }
        return new BLS12Point(x, BLS12Fq.ZERO, true);
      }
      let y = this.YFromX(x);
      if (!y) {
        throw new BLSPointNotOnCurveError(x);
      }
      if (y.isNegative() !== sort) {
        y = y.negate();
      }
      return new BLS12Point(x, y, infinity);
    } else {
      throw new Error('Invalid compressed G1 point of BLS12-381');
    }
  }

  /**
   * Converts a Point to two BN254 Fr elements by storing its compressed form as:
   * +------------------+------------------+
   * | Field Element 1  | Field Element 2  |
   * | [bytes 0-31]     | [bytes 32-47]   |
   * +------------------+------------------+
   * |     32 bytes     |     16 bytes    |
   * +------------------+------------------+
   * Used in the rollup circuits to store blob commitments in the native field type. See blob.ts.
   * @param point - A BLS12Point instance.
   * @returns The point fields.
   */
  toBN254Fields() {
    const compressed = this.compress();
    return [new Fr(compressed.subarray(0, 31)), new Fr(compressed.subarray(31, 48))];
  }

  /**
   * Creates a Point instance from 2 BN254 Fr fields as encoded in toBNFields() above.
   * Used in the rollup circuits to store blob commitments in the native field type. See blob.ts.
   * @param fields - The encoded BN254 fields.
   * @returns The point fields.
   */
  static fromBN254Fields(fields: [Fr, Fr]) {
    return BLS12Point.decompress(Buffer.concat([fields[0].toBuffer().subarray(1), fields[1].toBuffer().subarray(-17)]));
  }

  /**
   * Creates a point from an array of 2 fields.
   * @returns The point
   */
  static fromBLS12FqFields(fields: BLS12Fq[]) {
    return new this(fields[0], fields[1], !fields[2].isEmpty());
  }

  /**
   * Creates a point from @noble/curves projective point definition.
   * @returns The point
   */
  static fromNobleProjectivePoint(point: ProjPointType<bigint>) {
    const affine = point.toAffine();
    return new BLS12Point(
      new BLS12Fq(affine.x),
      new BLS12Fq(affine.y),
      point.equals(bls12_381.G1.ProjectivePoint.ZERO),
    );
  }

  /**
   * Uses the x coordinate and isPositive flag (+/-) to reconstruct the point.
   * @param x - The x coordinate of the point
   * @param sign - The "sign" of the y coordinate - note that this is not a sign as is known in integer arithmetic.
   * Instead it is a boolean flag that determines whether the y coordinate is <= (Fr.MODULUS - 1) / 2
   * @returns The point as an array of 2 fields
   */
  static fromXAndSign(x: BLS12Fq, sign: boolean) {
    const y = BLS12Point.YFromX(x);
    if (y == null) {
      throw new BLSPointNotOnCurveError(x);
    }

    const yPositiveBigInt = y.isNegative() ? BLS12Fq.MODULUS - y.toBigInt() : y.toBigInt();
    const yNegativeBigInt = BLS12Fq.MODULUS - yPositiveBigInt;

    // Choose the positive or negative root based on isPositive
    const finalY = sign ? new BLS12Fq(yPositiveBigInt) : new BLS12Fq(yNegativeBigInt);

    // Create and return the new Point
    return new this(x, finalY, false);
  }

  /**
   * @param x - The x coordinate of the point
   * @returns y^2 such that y^2 = x^3 + 4
   */
  static YSquaredFromX(x: BLS12Fq): BLS12Fq {
    return new BLS12Fq(bls12_381.G1.weierstrassEquation(x.toBigInt()));
  }

  /**
   * @param x - The x coordinate of the point
   * @returns The y coordinate of the point, if it exists on BLS12-381
   */
  static YFromX(x: BLS12Fq): BLS12Fq | null {
    const ySquared = this.YSquaredFromX(x);
    // y is then simply the square root. Note however that not all square roots exist in the field: if sqrt returns null
    // then there is no point in the curve with this x coordinate.
    return ySquared.sqrt();
  }

  /**
   * @param x - The x coordinate of the point
   * @param y - The y coordinate of the point
   * @returns Whether the point exists on BLS12-381
   */
  static isOnCurve(x: BLS12Fq, y: BLS12Fq) {
    if (x.isZero() && y.isZero()) {
      // Representation of inf point
      return true;
    }

    // The BLS12-381 equation is y^2 = x^3 + 4. We could use `YFromX` and then compare to `this.y`, but this would
    // involve computing the square root of y, of which there are two possible valid values. This method is also faster.
    const lhs = y.square();
    const rhs = this.YSquaredFromX(x);
    return lhs.equals(rhs);
  }

  /**
   * Returns the contents of the point as an array of 2 fields.
   * @returns The point as an array of 2 fields
   */
  toBLS12FqFields() {
    return [this.x, this.y, new BLS12Fq(this.isInfinite ? 1 : 0)];
  }

  /**
   * Returns the x coordinate and the sign of the y coordinate.
   * @dev The y sign can be determined by checking if the y coordinate is greater than half of the modulus.
   * @returns The x coordinate and the sign of the y coordinate.
   */
  toXAndSign(): [BLS12Fq, boolean] {
    return [this.x, !this.y.isNegative()];
  }

  /**
   * Returns the contents of the point as BigInts.
   * @returns The point as BigInts
   */
  toBigInts() {
    return {
      x: this.x.toBigInt(),
      y: this.y.toBigInt(),
      isInfinite: this.isInfinite ? 1n : 0n,
    };
  }

  /**
   * Converts the Point instance to a Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance.
   * @dev Note that toBuffer does not include the isInfinite flag and other serialization methods do (e.g. toBigInts).
   */
  toBuffer() {
    const buf = serializeToBuffer([this.x, this.y]);
    if (buf.length !== BLS12Point.SIZE_IN_BYTES) {
      throw new Error(`Invalid buffer length for Point: ${buf.length}`);
    }
    return buf;
  }

  /**
   * Convert the Point instance to a hexadecimal string representation.
   * The output string is prefixed with '0x' and consists of exactly 128 hex characters,
   * representing the concatenated x and y coordinates of the point.
   *
   * @returns A hex-encoded string representing the Point instance.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Check if two Point instances are equal by comparing their buffer values.
   * Returns true if the buffer values are the same, and false otherwise.
   *
   * @param rhs - The Point instance to compare with the current instance.
   * @returns A boolean indicating whether the two Point instances are equal.
   */
  equals(rhs: BLS12Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y);
  }

  /**
   * Check whether the point is zero.
   */
  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  /**
   * Check if this is point at infinity.
   * Check this is consistent with how bb is encoding the point at infinity
   */
  public get inf() {
    return this.isInfinite;
  }

  /** Arithmetic - wrapper around noble curves */

  toNobleProjectivePoint() {
    return bls12_381.G1.ProjectivePoint.fromAffine(this.toBigInts());
  }

  add(rhs: BLS12Point) {
    return BLS12Point.fromNobleProjectivePoint(this.toNobleProjectivePoint().add(rhs.toNobleProjectivePoint()));
  }

  negate() {
    return new BLS12Point(this.x, this.y.negate(), this.isInfinite);
  }

  sub(rhs: BLS12Point) {
    return BLS12Point.fromNobleProjectivePoint(this.toNobleProjectivePoint().subtract(rhs.toNobleProjectivePoint()));
  }

  /**
   * @dev From noble curves package:
   * Constant time multiplication. Uses wNAF method. Windowed method may be 10% faster,
   * but takes 2x longer to generate and consumes 2x memory.
   * Uses precomputes when available, uses endomorphism for Koblitz curves.
   * @param scalar by which the point would be multiplied
   * @returns New point
   */
  mul(rhs: BLS12Fr) {
    // Note: noble curves throws on 0
    if (rhs.isZero()) {
      return BLS12Point.ZERO;
    }
    return BLS12Point.fromNobleProjectivePoint(this.toNobleProjectivePoint().multiply(rhs.toBigInt()));
  }

  /**
   * @dev From noble curves package:
   * Non-constant-time multiplication. Uses double-and-add algorithm.
   * It's faster, but should only be used when you don't care about an exposed private key e.g. sig verification, which works over *public* keys.
   * @param scalar by which the point would be multiplied
   * @returns New point
   */
  mulUnsafe(rhs: BLS12Fr) {
    return BLS12Point.fromNobleProjectivePoint(this.toNobleProjectivePoint().multiplyUnsafe(rhs.toBigInt()));
  }

  /**
   * @dev From noble curves package:
   * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
   * Not using Strauss-Shamir trick: precomputation tables are faster. The trick could be useful if both P and Q are not G (not in our case).
   * @returns affine point
   */
  mulAndAddUnsafe(a: BLS12Fr, b: BLS12Fr, Q: BLS12Point) {
    const res = this.toNobleProjectivePoint().multiplyAndAddUnsafe(
      Q.toNobleProjectivePoint(),
      a.toBigInt(),
      b.toBigInt(),
    );
    return res ? BLS12Point.fromNobleProjectivePoint(res) : BLS12Point.ZERO;
  }
}

export class BLSPointNotOnCurveError extends Error {
  constructor(x: BLS12Fq, y?: BLS12Fq) {
    super('The given G1 point is not on the BLS12-381 curve: (' + x.toString() + ', ' + (y ? y.toString() : '') + ')');
    this.name = 'NotOnCurveError';
  }
}

/**
 * Lifted from noble curves bls12_381 since it's not exposed. Sets the flags
 * for BLS12-381 point compression.
 * @dev 'sort' refers to 'is_greater' i.e. y > (p - 1)/2
 */
function setMask(bytes: Buffer, mask: { compressed?: boolean; infinity?: boolean; sort?: boolean }) {
  if (bytes[0] & 0b1110_0000) {
    throw new Error('setMask: non-empty mask');
  }
  if (mask.compressed) {
    bytes[0] |= 0b1000_0000;
  }
  if (mask.infinity) {
    bytes[0] |= 0b0100_0000;
  }
  if (mask.sort) {
    bytes[0] |= 0b0010_0000;
  }
  return bytes;
}

/**
 * Lifted from noble curves bls12_381 since it's not exposed. Reads the flags
 * for BLS12-381 point compression.
 * @dev 'sort' refers to 'is_greater' i.e. y > (p - 1)/2
 */
function parseMask(bytes: Buffer) {
  // Copy, so we can remove mask data without affecting input bytes.
  const value = Buffer.from(bytes);
  const mask = value[0] & 0b1110_0000;
  const compressed = !!((mask >> 7) & 1); // compression bit (0b1000_0000)
  const infinity = !!((mask >> 6) & 1); // point at infinity bit (0b0100_0000)
  const sort = !!((mask >> 5) & 1); // sort bit (0b0010_0000)
  value[0] &= 0b0001_1111; // clear mask (zero first 3 bits)
  return { compressed, infinity, sort, value };
}
