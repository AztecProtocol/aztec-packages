import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

const ZERO_BUFFER = Buffer.alloc(32);

/**
 * Base field class.
 */
abstract class BaseField {
  static SIZE_IN_BYTES = 32;
  protected readonly valueBuffer: Buffer;
  private asBigInt?: bigint;

  /**
   * Return bigint representation.
   * @deprecated Just to get things compiling. Use toBigInt().
   * */
  get value(): bigint {
    return this.toBigInt();
  }

  protected constructor(value: any) {
    if (value instanceof BaseField) {
      this.valueBuffer = value.valueBuffer;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      this.valueBuffer = toBufferBE(BigInt(value), BaseField.SIZE_IN_BYTES);
    } else if (typeof value === 'bigint') {
      this.valueBuffer = toBufferBE(value, BaseField.SIZE_IN_BYTES);
    } else {
      this.valueBuffer = value;
    }
  }

  toBuffer(): Buffer {
    return this.valueBuffer;
  }

  toString(): `0x${string}` {
    return `0x${this.toBuffer().toString('hex')}`;
  }

  toBigInt(): bigint {
    if (!this.asBigInt) {
      this.asBigInt = toBigIntBE(this.valueBuffer);
    }
    return this.asBigInt;
  }

  toShortString(): string {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  equals(rhs: BaseField): boolean {
    return this.valueBuffer.equals(rhs.valueBuffer);
  }

  isZero(): boolean {
    return this.valueBuffer.equals(ZERO_BUFFER);
  }

  toFriendlyJSON(): string {
    return `0x${this.toBigInt().toString()}`;
  }

  toField() {
    return this;
  }
}

/**
 * Fr field class.
 */
export class Fr extends BaseField {
  static ZERO = new this(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
  static MAX_VALUE = this.MODULUS - 1n;

  constructor(value: number | bigint | boolean | Fr | Buffer) {
    super(value);
  }

  static random() {
    const r = toBigIntBE(randomBytes(BaseField.SIZE_IN_BYTES)) % this.MODULUS;
    return new this(r);
  }

  static zero() {
    return new this(0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(toBigIntBE(reader.readBytes(Fr.SIZE_IN_BYTES)));
  }

  static fromBufferReduce(buffer: Buffer) {
    return this.fromBuffer(toBufferBE(toBigIntBE(buffer) % this.MODULUS, 32));
  }

  static fromString(address: string) {
    const buffer = Buffer.from(address.replace(/^0x/i, ''), 'hex');
    return this.fromBuffer(buffer);
  }
}

/**
 * Fq field class.
 */
export class Fq extends BaseField {
  static ZERO = new this(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
  static MAX_VALUE = this.MODULUS - 1n;

  constructor(value: number | bigint | boolean | Fq | Buffer) {
    super(value);
  }

  static random() {
    const r = toBigIntBE(randomBytes(BaseField.SIZE_IN_BYTES)) % this.MODULUS;
    return new this(r);
  }

  static zero() {
    return new this(0n);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(toBigIntBE(reader.readBytes(Fr.SIZE_IN_BYTES)));
  }

  static fromBufferReduce(buffer: Buffer) {
    return this.fromBuffer(toBufferBE(toBigIntBE(buffer) % this.MODULUS, 32));
  }

  static fromString(address: string) {
    const buffer = Buffer.from(address.replace(/^0x/i, ''), 'hex');
    return this.fromBuffer(buffer);
  }
}
