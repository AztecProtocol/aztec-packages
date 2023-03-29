import { randomBytes } from '../crypto/index.js';
import { BufferReader } from '../index.js';

export class Point {
  public static SIZE_IN_BYTES = 64;
  public static ZERO = new Point(Buffer.alloc(Point.SIZE_IN_BYTES));

  constructor(private buffer: Buffer) {
    if (buffer.length !== Point.SIZE_IN_BYTES) {
      throw new Error(`Expect buffer size to be ${Point.SIZE_IN_BYTES}. Got ${buffer.length}.`);
    }
  }

  static fromBuffer(bufferOrReader: Buffer | BufferReader) {
    const reader = BufferReader.asReader(bufferOrReader);
    return new Point(reader.readBytes(this.SIZE_IN_BYTES));
  }

  public static fromString(address: string) {
    return new Point(Buffer.from(address.replace(/^0x/i, ''), 'hex'));
  }

  public static random() {
    return new Point(randomBytes(this.SIZE_IN_BYTES));
  }

  public equals(rhs: Point) {
    return this.buffer.equals(rhs.toBuffer());
  }

  public toBuffer() {
    return this.buffer;
  }

  public toString() {
    return `0x${this.buffer.toString('hex')}`;
  }

  public toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }
}
