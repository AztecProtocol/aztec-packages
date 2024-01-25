import { Fr } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';

export interface FieldValueType {
  add(rhs: FieldValueType): FieldValueType;
  sub(rhs: FieldValueType): FieldValueType;
  mul(rhs: FieldValueType): FieldValueType;
  div(rhs: FieldValueType): FieldValueType;

  // Use sparingly.
  toBigInt(): bigint;
}

export interface IntegralValueType extends FieldValueType {
  shl(rhs: IntegralValueType): IntegralValueType;
  shr(rhs: IntegralValueType): IntegralValueType;
  and(rhs: IntegralValueType): IntegralValueType;
  or(rhs: IntegralValueType): IntegralValueType;
  xor(rhs: IntegralValueType): IntegralValueType;
  not(): IntegralValueType;
}

// TODO: optimize calculation of mod, etc. Can only 1 per class?
// TODO: optimize return new UnsignedInteger.
abstract class UnsignedInteger implements IntegralValueType {
  private readonly bitmask: bigint;
  private readonly mod: bigint;

  protected constructor(private n: bigint, private bits: bigint) {
    assert(bits > 0);
    // x % 2^n == x & (2^n - 1)
    this.mod = 1n << bits;
    this.bitmask = this.mod - 1n;
    assert(n < this.mod);
  }

  // TODO: comment
  protected abstract build(n: bigint): UnsignedInteger;

  public add(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build((this.n + rhs.n) & this.bitmask);
  }

  public sub(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    const res: bigint = this.n - rhs.n;
    return this.build(res >= 0 ? res : res + this.mod);
  }

  public mul(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build((this.n * rhs.n) & this.bitmask);
  }

  public div(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build(this.n / rhs.n);
  }

  // No sign extension.
  public shr(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    // Note that this.n is > 0 by class invariant.
    return this.build(this.n >> rhs.n);
  }

  public shl(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build((this.n << rhs.n) & this.bitmask);
  }

  public and(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build(this.n & rhs.n);
  }

  public or(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build(this.n | rhs.n);
  }

  public xor(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return this.build(this.n ^ rhs.n);
  }

  public not(): UnsignedInteger {
    return this.build(~this.n & this.bitmask);
  }

  public toBigInt(): bigint {
    return this.n;
  }

  public equals(rhs: UnsignedInteger) {
    return this.bits == rhs.bits && this.toBigInt() == rhs.toBigInt();
  }
}

export class Uint8 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 8n);
  }

  // TODO: should be private
  build(n: bigint): Uint8 {
    return new Uint8(n);
  }
}

export class Uint16 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 16n);
  }

  // TODO: should be private
  build(n: bigint): Uint16 {
    return new Uint16(n);
  }
}

export class Uint32 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 32n);
  }

  // TODO: should be private
  build(n: bigint): Uint32 {
    return new Uint32(n);
  }
}

export class Uint64 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 64n);
  }

  // TODO: should be private
  build(n: bigint): Uint64 {
    return new Uint64(n);
  }
}

export class Uint128 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 128n);
  }

  // TODO: should be private
  build(n: bigint): Uint128 {
    return new Uint128(n);
  }
}

export class FieldValue implements FieldValueType {
  private readonly rep: Fr;

  constructor(v: number | bigint | Fr) {
    this.rep = new Fr(v);
  }

  public add(rhs: FieldValue): FieldValue {
    return new FieldValue(this.rep.add(rhs.rep));
  }

  public sub(rhs: FieldValue): FieldValue {
    return new FieldValue(this.rep.sub(rhs.rep));
  }

  public mul(rhs: FieldValue): FieldValue {
    return new FieldValue(this.rep.mul(rhs.rep));
  }

  public div(rhs: FieldValue): FieldValue {
    return new FieldValue(this.rep.div(rhs.rep));
  }

  public toBigInt(): bigint {
    return this.rep.toBigInt();
  }
}

export enum TypeTag {
  UNINITIALIZED,
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
  FIELD,
  INVALID,
}

export class TaggedMemory {
  private _mem: FieldValueType[];

  constructor() {
    this._mem = [];
  }

  public get(offset: number): FieldValueType {
    return this.getAs<FieldValueType>(offset);
  }

  public getAs<T>(offset: number): T {
    assert(offset < 2n ** 32n);
    // TODO: non-existing case.
    const e = this._mem[offset];
    return <T>e;
  }

  public getSlice(offset: number, size: number): FieldValueType[] {
    assert(offset < 2n ** 32n);
    // TODO: non-existing case.
    return this._mem.slice(offset, offset + size);
  }

  public getSliceTags(offset: number, size: number): TypeTag[] {
    assert(offset < 2n ** 32n);
    // TODO: non-existing case.
    return this._mem.slice(offset, offset + size).map(TaggedMemory.getTag);
  }

  public set(offset: number, v: FieldValueType) {
    assert(offset < 2n ** 32n);
    this._mem[offset] = v;
  }

  public setSlice(offset: number, vs: FieldValueType[]) {
    assert(offset < 2n ** 32n);
    this._mem.splice(offset, vs.length, ...vs);
  }

  public getTag(offset: number): TypeTag {
    return TaggedMemory.getTag(this._mem[offset]);
  }

  public tagsMatchStrict(offsetA: number, offsetB: number): boolean {
    return this.getTag(offsetA) == this.getTag(offsetB);
  }

  public tagsMatch(offsetA: number, offsetB: number): boolean {
    return (
      this.tagsMatchStrict(offsetA, offsetB) ||
      this.getTag(offsetA) == TypeTag.UNINITIALIZED ||
      this.getTag(offsetB) == TypeTag.UNINITIALIZED
    );
  }

  public static getTag(v: FieldValueType | undefined): TypeTag {
    let tag = TypeTag.INVALID;

    if (v === undefined) {
      tag = TypeTag.UNINITIALIZED;
    } else if (v instanceof FieldValue) {
      tag = TypeTag.FIELD;
    } else if (v instanceof Uint8) {
      tag = TypeTag.UINT8;
    } else if (v instanceof Uint16) {
      tag = TypeTag.UINT16;
    } else if (v instanceof Uint32) {
      tag = TypeTag.UINT32;
    } else if (v instanceof Uint64) {
      tag = TypeTag.UINT64;
    } else if (v instanceof Uint128) {
      tag = TypeTag.UINT128;
    }

    return tag;
  }

  // Truncates!
  public static integralFromTag(v: bigint, tag: TypeTag): IntegralValueType {
    switch (tag) {
      case TypeTag.UINT8:
        return new Uint8(v & ((1n << 8n) - 1n));
      case TypeTag.UINT16:
        return new Uint16(v & ((1n << 16n) - 1n));
      case TypeTag.UINT32:
        return new Uint32(v & ((1n << 32n) - 1n));
      case TypeTag.UINT64:
        return new Uint64(v & ((1n << 64n) - 1n));
      case TypeTag.UINT128:
        return new Uint128(v & ((1n << 128n) - 1n));
      default:
        // TODO: better message
        throw new Error('wrong tag for integral type');
    }
  }
}
