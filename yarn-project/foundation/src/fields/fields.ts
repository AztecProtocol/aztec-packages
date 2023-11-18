import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

const ZERO_BUFFER = Buffer.alloc(32);

/**
 * Base field class.
 * Conversions from Buffer to BigInt and vice-versa are not cheap.
 * We allow construction with either form and lazily convert to other as needed.
 */
abstract class BaseField {
  static SIZE_IN_BYTES = 32;
  private asBuffer?: Buffer;
  private asBigInt?: bigint;

  /**
   * Return bigint representation.
   * @deprecated Just to get things compiling. Use toBigInt().
   * */
  get value(): bigint {
    return this.toBigInt();
  }

  protected constructor(value: number | bigint | boolean | BaseField | Buffer) {
    if (value instanceof BaseField) {
      this.asBuffer = value.asBuffer;
      this.asBigInt = value.asBigInt;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      this.asBuffer = toBufferBE(BigInt(value), BaseField.SIZE_IN_BYTES);
    } else if (typeof value === 'bigint') {
      this.asBigInt = value;
    } else if (value instanceof Buffer) {
      this.asBuffer = value;
    } else {
      throw new Error(`Type '${typeof value}' with value '${value}' passed to BaseField ctor.`);
    }
    // Hack to init both to makes tests pass.
    this.toBuffer();
    this.toBigInt();
  }

  toBuffer(): Buffer {
    if (!this.asBuffer) {
      this.asBuffer = toBufferBE(this.asBigInt!, 32);
    }
    return Buffer.from(this.asBuffer);
  }

  toString(): `0x${string}` {
    return `0x${this.toBuffer().toString('hex')}`;
  }

  toBigInt(): bigint {
    if (!this.asBigInt) {
      this.asBigInt = toBigIntBE(this.asBuffer!);
    }
    return this.asBigInt;
  }

  toShortString(): string {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  equals(rhs: BaseField): boolean {
    return this.toBuffer().equals(rhs.toBuffer());
  }

  isZero(): boolean {
    return this.toBuffer().equals(ZERO_BUFFER);
  }

  toFriendlyJSON(): string {
    return `0x${this.toBigInt().toString()}`;
  }

  toField() {
    return this;
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/* eslint-disable jsdoc/require-jsdoc */

export interface Fr {
  _branding: 'Fr';
}

/**
 * Fr field class.
 */
export class Fr extends BaseField {
  static ZERO = new Fr(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
  static MAX_VALUE = this.MODULUS - 1n;

  constructor(value: number | bigint | boolean | Fr | Buffer) {
    super(value);
  }

  static random() {
    const r = toBigIntBE(randomBytes(BaseField.SIZE_IN_BYTES)) % Fr.MODULUS;
    return new Fr(r);
  }

  static zero() {
    return Fr.ZERO;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Fr(toBigIntBE(reader.readBytes(Fr.SIZE_IN_BYTES)));
  }

  static fromBufferReduce(buffer: Buffer) {
    return Fr.fromBuffer(toBufferBE(toBigIntBE(buffer) % Fr.MODULUS, 32));
  }

  static fromString(buf: string) {
    const buffer = Buffer.from(buf.replace(/^0x/i, ''), 'hex');
    if (buffer.length !== Fr.SIZE_IN_BYTES) {
      throw new Error(`Invalid length ${buffer.length}.`);
    }
    return Fr.fromBuffer(buffer);
  }
}

export interface Fq {
  _branding: 'Fq';
}

/**
 * Fq field class.
 */
export class Fq extends BaseField {
  // Brand property for nominal typing.
  private readonly _fqBranding: void = undefined;

  static ZERO = new Fq(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
  static MAX_VALUE = this.MODULUS - 1n;

  constructor(value: number | bigint | boolean | Fq | Buffer) {
    super(value);
  }

  static random() {
    const r = toBigIntBE(randomBytes(BaseField.SIZE_IN_BYTES)) % Fq.MODULUS;
    return new Fq(r);
  }

  static zero() {
    return Fq.ZERO;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new Fq(toBigIntBE(reader.readBytes(Fq.SIZE_IN_BYTES)));
  }

  static fromBufferReduce(buffer: Buffer) {
    return Fq.fromBuffer(toBufferBE(toBigIntBE(buffer) % Fq.MODULUS, 32));
  }

  static fromString(buf: string) {
    if (buf.length !== Fr.SIZE_IN_BYTES) {
      throw new Error(`Invalid length ${buf.length}.`);
    }
    const buffer = Buffer.from(buf.replace(/^0x/i, ''), 'hex');
    return Fq.fromBuffer(buffer);
  }
}
