import { toBigIntBE, toBufferBE } from '../bigint-buffer/index.js';
import { randomBytes } from '../crypto/index.js';
import { BufferReader } from '../serialize/buffer_reader.js';

const ZERO_BUFFER = Buffer.alloc(32);

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/* eslint-disable jsdoc/require-jsdoc */

type DerivedField<T extends BaseField> = {
  new (value: any): T;
  MODULUS: bigint;
};

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
    if (value instanceof Buffer) {
      this.asBuffer =
        value.length === 32 ? value : Buffer.concat([Buffer.alloc(BaseField.SIZE_IN_BYTES - value.length), value]);
    } else if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
      this.asBigInt = BigInt(value);
      if (this.asBigInt >= this.modulus()) {
        throw new Error('Value >= to field modulus.');
      }
    } else if (value instanceof BaseField) {
      this.asBuffer = value.asBuffer;
      this.asBigInt = value.asBigInt;
    } else {
      throw new Error(`Type '${typeof value}' with value '${value}' passed to BaseField ctor.`);
    }

    // Hack to init both to makes tests pass.
    // Loads of our tests are just doing deep equality rather than calling e.g. toBigInt() first.
    // This ensures the deep equality passes regardless of the internal representation.
    this.toBuffer();
    this.toBigInt();
  }

  protected abstract modulus(): bigint;

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
    if (this.asBigInt === undefined) {
      this.asBigInt = toBigIntBE(this.asBuffer!);
      if (this.asBigInt >= this.modulus()) {
        throw new Error('Value >= to field modulus.');
      }
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

// Free functions for calling from static constructors.
function fromBuffer<T extends BaseField>(buffer: Buffer | BufferReader, f: DerivedField<T>) {
  const reader = BufferReader.asReader(buffer);
  return new f(reader.readBytes(BaseField.SIZE_IN_BYTES));
}

function fromBufferReduce<T extends BaseField>(buffer: Buffer, f: DerivedField<T>) {
  return new f(toBigIntBE(buffer) % f.MODULUS);
}

function random<T extends BaseField>(f: DerivedField<T>): T {
  return fromBufferReduce(randomBytes(32), f);
}

function fromString<T extends BaseField>(buf: string, f: DerivedField<T>) {
  const buffer = Buffer.from(buf.replace(/^0x/i, ''), 'hex');
  return new f(buffer);
}

/**
 * Branding to ensure Fr and Fq are not interchangeable types.
 */
export interface Fr {
  _branding: 'Fr';
}

/**
 * Fr field class.
 */
export class Fr extends BaseField {
  static ZERO = new Fr(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

  constructor(value: number | bigint | boolean | Fr | Buffer) {
    super(value);
  }

  protected modulus() {
    return Fr.MODULUS;
  }

  static random() {
    return random(Fr);
  }

  static zero() {
    return Fr.ZERO;
  }

  // TODO: Split into 2.
  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, Fr);
  }

  static fromBufferReduce(buffer: Buffer) {
    return fromBufferReduce(buffer, Fr);
  }

  static fromString(buf: string) {
    return fromString(buf, Fr);
  }
}

/**
 * Branding to ensure Fr and Fq are not interchangeable types.
 */
export interface Fq {
  _branding: 'Fq';
}

/**
 * Fq field class.
 */
export class Fq extends BaseField {
  static ZERO = new Fq(0n);
  static MODULUS = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;

  constructor(value: number | bigint | boolean | Fq | Buffer) {
    super(value);
  }

  protected modulus() {
    return Fq.MODULUS;
  }

  static random() {
    return random(Fq);
  }

  static zero() {
    return Fq.ZERO;
  }

  // TODO: Split into 2.
  static fromBuffer(buffer: Buffer | BufferReader) {
    return fromBuffer(buffer, Fq);
  }

  static fromBufferReduce(buffer: Buffer) {
    return fromBufferReduce(buffer, Fq);
  }

  static fromString(buf: string) {
    return fromString(buf, Fq);
  }
}
