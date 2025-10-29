import { Fr } from './fields.js';

/**
 * Internal Point class for tests.
 * @dev This minimal implementation is provided for testing barretenberg directly.
 * Projects using bb.js should create their own point abstraction using the curve point
 * types and operations exported from the barretenberg API.
 */
export class Point {
  static SIZE_IN_BYTES = 64;
  static EMPTY = new Point(Fr.ZERO, Fr.ZERO);

  constructor(
    public readonly x: Fr,
    public readonly y: Fr,
  ) {}

  static fromBuffer(buffer: Uint8Array) {
    if (buffer.length !== this.SIZE_IN_BYTES) {
      throw new Error(`Expected ${this.SIZE_IN_BYTES} bytes, got ${buffer.length}`);
    }
    return new this(Fr.fromBuffer(buffer.subarray(0, 32)), Fr.fromBuffer(buffer.subarray(32, 64)));
  }

  toBuffer() {
    return Buffer.concat([this.x.toBuffer(), this.y.toBuffer()]);
  }

  equals(rhs: Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y);
  }
}
