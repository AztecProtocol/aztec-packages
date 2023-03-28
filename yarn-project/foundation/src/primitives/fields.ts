import { randomBytes } from 'crypto';
import { toBigIntBE, toBufferBE } from '../index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

export class Fr {
  static ZERO = new Fr(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
  static MAX_VALUE = Fr.MODULUS - 1n;
  static SIZE_IN_BYTES = 32;

  constructor(public readonly value: bigint) {}

  static random() {
    const r = toBigIntBE(randomBytes(64)) % Fr.MODULUS;
    return new Fr(r);
  }

  static fromBuffer(buffer: Buffer) {
    if (buffer.length > this.SIZE_IN_BYTES) {
      throw new Error(`Unexpected buffer size ${buffer.length} (expected ${this.SIZE_IN_BYTES} bytes)`);
    }
    return new this(toBigIntBE(buffer));
  }

  static fromBufferReader(reader: BufferReader) {
    return this.fromBuffer(reader.readBytes(this.SIZE_IN_BYTES));
  }

  toBuffer() {
    return toBufferBE(this.value, 32);
  }
}

export class Fq {
  static MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
  static MAX_VALUE = Fr.MODULUS - 1n;
  static SIZE_IN_BYTES = 32;

  constructor(public readonly value: bigint) {}

  static random() {
    const r = toBigIntBE(randomBytes(64)) % Fr.MODULUS;
    return new this(r);
  }

  static fromBuffer(buffer: Buffer) {
    if (buffer.length > this.SIZE_IN_BYTES) {
      throw new Error(`Unexpected buffer size ${buffer.length} (expected ${this.SIZE_IN_BYTES} bytes)`);
    }
    return new this(toBigIntBE(buffer));
  }

  static fromBufferReader(reader: BufferReader) {
    return this.fromBuffer(reader.readBytes(this.SIZE_IN_BYTES));
  }

  toBuffer() {
    return toBufferBE(this.value, 32);
  }
}
