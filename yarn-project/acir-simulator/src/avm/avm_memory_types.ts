import { strict as assert } from 'assert';
import { Fr } from '@aztec/foundation/fields';

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
class UnsignedInteger implements IntegralValueType {
  private readonly bitmask: bigint;
  private readonly mod: bigint;

  protected constructor(private n: bigint, private bits: bigint) {
    assert(bits > 0);
    // x % 2^n == x & (2^n - 1)
    this.mod = 2n**bits;
    this.bitmask = this.mod - 1n;
    assert(n < this.mod);
  }

  public add(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger((this.n + rhs.n) & this.bitmask, this.bits);
  }

  public sub(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    const res: bigint = this.n - rhs.n;
    return new UnsignedInteger(res >= 0 ? res : res + this.mod, this.bits);
  }

  public mul(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger((this.n * rhs.n) & this.bitmask, this.bits);
  }

  public div(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger(this.n / rhs.n, this.bits);
  }

  // No sign extension.
  public shr(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    // Note that this.n is > 0 by class invariant.
    return new UnsignedInteger(this.n >> rhs.n, this.bits);
  }

  public shl(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger((this.n << rhs.n) & this.bitmask, this.bits);
  }

  public and(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger(this.n & rhs.n, this.bits);
  }

  public or(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger(this.n | rhs.n, this.bits);
  }

  public xor(rhs: UnsignedInteger): UnsignedInteger {
    assert(this.bits == rhs.bits);
    return new UnsignedInteger(this.n ^ rhs.n, this.bits);
  }

  public not(): UnsignedInteger {
    return new UnsignedInteger(~this.n & this.bitmask, this.bits);
  }
 
  public toBigInt(): bigint {
    return this.n;
  }

  public equals(rhs: UnsignedInteger) {
    return this.bits == rhs.bits && this.toBigInt() == rhs.toBigInt();
  }

  // Factory methods.
  // public static Uint8(v: number | bigint): UnsignedInteger {
  //   const bitmask = 2n**8n - 1n;
  //   return new UnsignedInteger(BigInt(v) & bitmask, 8n);
  // }

  // Add casting operators.
}

export class Uint8 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 8n);
  }
}

export class Uint16 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 16n);
  }
}

export class Uint32 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 32n);
  }
}

export class Uint64 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 64n);
  }
}

export class Uint128 extends UnsignedInteger {
  constructor(n: number | bigint) {
    super(BigInt(n), 128n);
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
}

// export class TaggedMemoryCell {
//   private _value: MemoryValueType;
//   private _tag: TypeTag;

//   constructor() {
//     this._value = new UInt8Value(0n);
//     this._tag = TypeTag.UINT8;
//   }

//   public value() {
//     return this._value;
//   }
//   //private constructor(private value: MemoryValueType, private tag: TypeTag) {
//   // private constructor(value: MemoryValueType, tag: TypeTag) {
//   //   //assert(value >= 0);
//   // }

//   // public static ofUint8(v: number | bigint): TaggedMemoryCell {
//   //   return new TaggedMemoryCell(BigInt(v));
//   // }


// }