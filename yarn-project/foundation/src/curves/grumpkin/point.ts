import { toBigIntBE } from '../../bigint-buffer/index.js';
import { randomBoolean } from '../../crypto/random/index.js';
import { hexSchemaFor } from '../../schemas/utils.js';
import { BufferReader, FieldReader, serializeToBuffer } from '../../serialize/index.js';
import { bufferToHex, hexToBuffer } from '../../string/index.js';
import { Fr } from '../bn254/field.js';

/**
 * Represents a Point on an elliptic curve with x and y coordinates.
 * The Point class provides methods for creating instances from different input types,
 * converting instances to various output formats, and checking the equality of points.
 * TODO(#7386): Clean up this class.
 */
export class Point {
  static INFINITY = new Point(Fr.ZERO, Fr.ZERO);
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  /** Used to differentiate this class from AztecAddress */
  public readonly kind = 'point';

  /** Whether the point is at infinity */
  public readonly isInfinite: boolean;

  constructor(
    /**
     * The point's x coordinate
     */
    public readonly x: Fr,
    /**
     * The point's y coordinate
     */
    public readonly y: Fr,
  ) {
    // TODO(#7386): check if on curve
    // NOTE: now there is no isInfinite in the struct, empty == inf, so an empty class would pass an on-curve check. This may be fine depending on the usage.
    this.isInfinite = x.isZero() && y.isZero();
  }

  toJSON() {
    return this.toString();
  }

  static get schema() {
    // Serialization from hex string.
    return hexSchemaFor(Point);
  }

  /**
   * Creates a Point from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * Handles buffers, existing instances, or objects with x, y, and isInfinite fields.
   * @param obj - Plain object, buffer, or Point instance
   * @returns A Point instance
   */
  static fromPlainObject(obj: any): Point {
    if (obj instanceof Point) {
      return obj;
    }
    if (obj instanceof Buffer || Buffer.isBuffer(obj)) {
      return Point.fromBuffer(obj);
    }
    return new this(Fr.fromPlainObject(obj.x), Fr.fromPlainObject(obj.y));
  }

  /**
   * Generate a random Point instance that is on the curve.
   *
   * @returns A randomly generated Point instance.
   */
  static async random() {
    while (true) {
      try {
        return await Point.fromXAndSign(Fr.random(), randomBoolean());
      } catch (e: any) {
        if (!(e instanceof NotOnCurveError)) {
          throw e;
        }
        // The random point is not on the curve - we try again
        continue;
      }
    }
  }

  /**
   * Create a Point instance from a given buffer or BufferReader.
   * The input 'buffer' should have exactly 64 bytes representing the x and y coordinates.
   *
   * @param buffer - The buffer or BufferReader containing the x and y coordinates of the point.
   * @returns A Point instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  /**
   * Create a Point instance from a compressed buffer.
   * The input 'buffer' should have exactly 33 bytes representing the x coordinate and the sign of the y coordinate.
   *
   * @param buffer - The buffer containing the x coordinate and the sign of the y coordinate.
   * @returns A Point instance.
   */
  static fromCompressedBuffer(buffer: Buffer | BufferReader): Promise<Point> {
    const reader = BufferReader.asReader(buffer);
    const value = toBigIntBE(reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES));

    const x = new Fr(value & ((1n << 255n) - 1n));
    const sign = (value & (1n << 255n)) !== 0n;

    return this.fromXAndSign(x, sign);
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
   * Returns the contents of the point as an array of 2 fields.
   * @returns The point as an array of 2 fields
   */
  toFields() {
    return [this.x, this.y];
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const [x, y] = [reader.readField(), reader.readField()];
    return new this(x, y);
  }

  /**
   * Uses the x coordinate and isPositive flag (+/-) to reconstruct the point.
   * @dev The y coordinate can be derived from the x coordinate and the "sign" flag by solving the grumpkin curve
   * equation for y.
   * @param x - The x coordinate of the point
   * @param sign - The "sign" of the y coordinate - note that this is not a sign as is known in integer arithmetic.
   * Instead it is a boolean flag that determines whether the y coordinate is <= (Fr.MODULUS - 1) / 2
   * @returns The point as an array of 2 fields
   */
  static async fromXAndSign(x: Fr, sign: boolean) {
    const y = await Point.YFromX(x);
    if (y == null) {
      throw new NotOnCurveError(x);
    }

    const yPositiveBigInt = y.toBigInt() <= (Fr.MODULUS - 1n) / 2n ? y.toBigInt() : Fr.MODULUS - y.toBigInt();
    const yNegativeBigInt = Fr.MODULUS - yPositiveBigInt;

    // Choose the positive or negative root based on isPositive
    const finalY = sign ? new Fr(yPositiveBigInt) : new Fr(yNegativeBigInt);

    // Create and return the new Point
    return new this(x, finalY);
  }

  /**
   * @param x - The x coordinate of the point
   * @returns y^2 such that y^2 = x^3 - 17
   */
  static YFromX(x: Fr): Promise<Fr | null> {
    // Calculate y^2 = x^3 - 17 (i.e. the Grumpkin curve equation)
    const ySquared = x.square().mul(x).sub(new Fr(17));

    // y is then simply the square root. Note however that not all square roots exist in the field: if sqrt returns null
    // then there is no point in the curve with this x coordinate.
    return ySquared.sqrt();
  }

  /**
   * Returns the x coordinate and the sign of the y coordinate.
   * @dev The y sign can be determined by checking if the y coordinate is greater than half of the modulus.
   * @returns The x coordinate and the sign of the y coordinate.
   */
  toXAndSign(): [Fr, boolean] {
    return [this.x, this.y.toBigInt() <= (Fr.MODULUS - 1n) / 2n];
  }

  /**
   * Returns the contents of the point as BigInts.
   * @returns The point as BigInts
   */
  toBigInts() {
    return {
      x: this.x.toBigInt(),
      y: this.y.toBigInt(),
    };
  }

  /**
   * Converts the Point instance to a Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance.
   * @dev Note that toBuffer does not include the isInfinite flag. The point at infinity is serialized as (0, 0).
   */
  toBuffer() {
    const buf = serializeToBuffer([this.x, this.y]);
    if (buf.length !== Point.SIZE_IN_BYTES) {
      throw new Error(`Invalid buffer length for Point: ${buf.length}`);
    }
    return buf;
  }

  /**
   * Converts the Point instance to a compressed Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance
   */
  toCompressedBuffer() {
    const [x, sign] = this.toXAndSign();
    // Here we leverage that Fr fits into 254 bits (log2(Fr.MODULUS) < 254) and given that we serialize Fr to 32 bytes
    // and we use big-endian the 2 most significant bits are never populated. Hence we can use one of the bits as
    // a sign bit.
    const compressedValue = x.toBigInt() + (sign ? 2n ** 255n : 0n);
    const buf = serializeToBuffer(compressedValue);
    if (buf.length !== Point.COMPRESSED_SIZE_IN_BYTES) {
      throw new Error(`Invalid buffer length for compressed Point: ${buf.length}`);
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
   * Generate a short string representation of the Point instance.
   * The returned string includes the first 10 and last 4 characters of the full string representation,
   * with '...' in between to indicate truncation. This is useful for displaying or logging purposes
   * when the full string representation may be too long.
   *
   * @returns A truncated string representation of the Point instance.
   */
  toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  toNoirStruct() {
    return { x: this.x, y: this.y };
  }

  // Used for IvpkM. TODO(#8124): Consider removing this method.
  toWrappedNoirStruct() {
    return { inner: this.toNoirStruct() };
  }

  /**
   * Check if two Point instances are equal by comparing their buffer values.
   * Returns true if the buffer values are the same, and false otherwise.
   *
   * @param rhs - The Point instance to compare with the current instance.
   * @returns A boolean indicating whether the two Point instances are equal.
   */
  equals(rhs: Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y);
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  /**
   * @param x - The x coordinate of the point
   * @param y - The y coordinate of the point
   * @returns Whether the point exists on Grumpkin
   */
  isOnCurve() {
    if (this.isInfinite) {
      return true;
    }

    // The Grumpkin equation is y^2 = x^3 - 17. We could use `YFromX` and then compare to `this.y`, but this would
    // involve computing the square root of y, of which there are two possible valid values. This method is also faster.
    const lhs = this.y.square();
    const rhs = this.x.mul(this.x).mul(this.x).sub(new Fr(17));
    return lhs.equals(rhs);
  }
}

export class NotOnCurveError extends Error {
  constructor(x: Fr) {
    super('The given x-coordinate is not on the Grumpkin curve: ' + x.toString());
    this.name = 'NotOnCurveError';
  }
}
