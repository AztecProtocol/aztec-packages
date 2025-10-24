import { Fr } from './fields.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import { poseidon2Hash } from '../crypto/poseidon/index.js';
import { randomBytes } from '../random/index.js';
import { uint8ArrayToBigIntBE } from '../bigint-array/index.js';

/**
 * Error thrown when trying to create a point that is not on the curve.
 */
export class NotOnCurveError extends Error {
  constructor(x: Fr) {
    super('The given x-coordinate is not on the Grumpkin curve: ' + x.toString());
    this.name = 'NotOnCurveError';
  }
}

/**
 * Represents a Point on the Grumpkin elliptic curve with x and y coordinates.
 * The Point class provides methods for creating instances from different input types,
 * converting instances to various output formats, and checking the equality of points.
 */
export class Point {
  static ZERO = new Point(Fr.ZERO, Fr.ZERO, false);
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  /** Used to differentiate this class from other types */
  public readonly kind = 'point';

  constructor(
    /**
     * The point's x coordinate
     */
    public readonly x: Fr,
    /**
     * The point's y coordinate
     */
    public readonly y: Fr,
    /**
     * Whether the point is at infinity
     */
    public readonly isInfinite: boolean = false,
  ) {}

  /**
   * Generate a random Point instance.
   *
   * @returns A randomly generated Point instance.
   */
  static async random() {
    while (true) {
      try {
        const randomBit = (randomBytes(1)[0] & 1) === 1;
        return await Point.fromXAndSign(Fr.random(), randomBit);
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
    return new this(Fr.fromBuffer(reader), Fr.fromBuffer(reader), false);
  }

  /**
   * Create a Point instance from a compressed buffer.
   * The input 'buffer' should have exactly 32 bytes representing the x coordinate and the sign of the y coordinate.
   *
   * @param buffer - The buffer containing the x coordinate and the sign of the y coordinate.
   * @returns A Point instance.
   */
  static async fromCompressedBuffer(buffer: Buffer | BufferReader): Promise<Point> {
    const reader = BufferReader.asReader(buffer);
    const bytes = reader.readBytes(Point.COMPRESSED_SIZE_IN_BYTES);

    // Extract y parity from MSB
    const sign = (bytes[0] & 0x80) !== 0;

    // Clear the parity bit to get x
    bytes[0] &= 0x7f;
    const x = Fr.fromBuffer(bytes);

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
    const hex = str.replace(/^0x/i, '');
    return this.fromBuffer(Buffer.from(hex, 'hex'));
  }

  /**
   * Returns the contents of the point as an array of fields (x, y, isInfinite).
   * @returns The point as an array of fields
   */
  toFields() {
    return [this.x, this.y, new Fr(this.isInfinite ? 1n : 0n)];
  }

  /**
   * Uses the x coordinate and sign flag (+/-) to reconstruct the point.
   * @dev The y coordinate can be derived from the x coordinate and the "sign" flag by solving the grumpkin curve
   * equation for y.
   * @param x - The x coordinate of the point
   * @param sign - The "sign" of the y coordinate - note that this is not a sign as is known in integer arithmetic.
   * Instead it is a boolean flag that determines whether the y coordinate is <= (Fr.MODULUS - 1) / 2
   * @returns The point
   */
  static async fromXAndSign(x: Fr, sign: boolean) {
    const y = await Point.YFromX(x);
    if (y == null) {
      throw new NotOnCurveError(x);
    }

    const yBigInt = uint8ArrayToBigIntBE(y.toBuffer());
    const yPositiveBigInt = yBigInt <= (Fr.MODULUS - 1n) / 2n ? yBigInt : Fr.MODULUS - yBigInt;
    const yNegativeBigInt = Fr.MODULUS - yPositiveBigInt;

    // Choose the positive or negative root based on sign
    const finalY = new Fr(sign ? yPositiveBigInt : yNegativeBigInt);

    // Create and return the new Point
    return new this(x, finalY, false);
  }

  /**
   * Derive the y coordinate from the x coordinate on the Grumpkin curve.
   * @param x - The x coordinate
   * @returns The y coordinate, or null if not on the curve
   */
  static async YFromX(x: Fr): Promise<Fr | null> {
    // Calculate y^2 = x^3 - 17 (i.e. the Grumpkin curve equation)
    const xBigInt = uint8ArrayToBigIntBE(x.toBuffer());
    const xSquared = (xBigInt * xBigInt) % Fr.MODULUS;
    const xCubed = (xSquared * xBigInt) % Fr.MODULUS;
    const ySquared = (xCubed - 17n + Fr.MODULUS) % Fr.MODULUS;

    // Use barretenberg to compute square root
    const ySquaredFr = new Fr(ySquared);
    return await ySquaredFr.sqrt();
  }

  /**
   * Returns the x coordinate and the sign of the y coordinate.
   * @dev The y sign can be determined by checking if the y coordinate is greater than half of the modulus.
   * @returns The x coordinate and the sign of the y coordinate.
   */
  toXAndSign(): [Fr, boolean] {
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());
    return [this.x, yBigInt <= (Fr.MODULUS - 1n) / 2n];
  }

  /**
   * Converts the Point instance to a Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance.
   */
  toBuffer() {
    if (this.isInfinite) {
      throw new Error('Cannot serialize infinite point');
    }
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  /**
   * Converts the Point instance to a compressed Buffer representation of the coordinates.
   * @returns A compressed Buffer representation of the Point instance
   */
  toCompressedBuffer() {
    const [x, sign] = this.toXAndSign();
    // Here we leverage that Fr fits into 254 bits (log2(Fr.MODULUS) < 254) and given that we serialize Fr to 32 bytes
    // and we use big-endian the 2 most significant bits are never populated. Hence we can use one of the bits as
    // a sign bit.
    const xBigInt = uint8ArrayToBigIntBE(x.toBuffer());
    const compressedValue = xBigInt + (sign ? 2n ** 255n : 0n);

    const buf = Buffer.alloc(Point.COMPRESSED_SIZE_IN_BYTES);
    const hex = compressedValue.toString(16).padStart(64, '0');
    Buffer.from(hex, 'hex').copy(buf);

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
    return '0x' + this.toBuffer().toString('hex');
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

  /**
   * Check if two Point instances are equal by comparing their x and y coordinates.
   *
   * @param rhs - The Point instance to compare with the current instance.
   * @returns A boolean indicating whether the two Point instances are equal.
   */
  equals(rhs: Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y) && this.isInfinite === rhs.isInfinite;
  }

  /**
   * Check if this point is zero (both coordinates are zero).
   * @returns True if the point is zero
   */
  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  /**
   * Compute a poseidon2 hash of this point.
   * @returns The hash as a field element
   */
  async hash() {
    return poseidon2Hash(this.toFields());
  }

  /**
   * Check if this point is at infinity.
   */
  get inf() {
    return this.isInfinite;
  }

  /**
   * Check if this point is on the Grumpkin curve.
   * @returns True if the point is on the curve
   */
  isOnGrumpkin() {
    if (this.inf) {
      return true;
    }

    // The Grumpkin equation is y^2 = x^3 - 17
    const xBigInt = uint8ArrayToBigIntBE(this.x.toBuffer());
    const yBigInt = uint8ArrayToBigIntBE(this.y.toBuffer());

    const lhs = (yBigInt * yBigInt) % Fr.MODULUS;
    const xSquared = (xBigInt * xBigInt) % Fr.MODULUS;
    const xCubed = (xSquared * xBigInt) % Fr.MODULUS;
    const rhs = (xCubed - 17n + Fr.MODULUS) % Fr.MODULUS;

    return lhs === rhs;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return this.toString();
  }
}
