import { Fr } from '@aztec/foundation/fields';

import { strict as assert } from 'assert';

import { TagCheckError } from './errors.js';

/** MemoryValue gathers the common operations for all memory types. */
export abstract class MemoryValue {
  public abstract add(rhs: MemoryValue): MemoryValue;
  public abstract sub(rhs: MemoryValue): MemoryValue;
  public abstract mul(rhs: MemoryValue): MemoryValue;
  public abstract div(rhs: MemoryValue): MemoryValue;

  public abstract equals(rhs: MemoryValue): boolean;

  // We need this to be able to build an instance of the subclasses.
  public abstract build(n: bigint): MemoryValue;

  // Use sparingly.
  public abstract toBigInt(): bigint;

  // To field
  public toFr(): Fr {
    return new Fr(this.toBigInt());
  }
}

/** IntegralValue gathers the common operations for all integral memory types. */
export abstract class IntegralValue extends MemoryValue {
  public abstract shl(rhs: IntegralValue): IntegralValue;
  public abstract shr(rhs: IntegralValue): IntegralValue;
  public abstract and(rhs: IntegralValue): IntegralValue;
  public abstract or(rhs: IntegralValue): IntegralValue;
  public abstract xor(rhs: IntegralValue): IntegralValue;
  public abstract not(): IntegralValue;

  public abstract lt(rhs: IntegralValue): boolean;
}

/**
 * This interface describes the required *static* properties for unsigned integer classes.
 * For example: Uint8, Uint16, Uint32, Uint64, Uint128.
 */
interface UnsignedIntegerClass {
  readonly bitmask: bigint;
  readonly mod: bigint;
  new (n: bigint | number): IntegralValue;
}

/**
 * This class implements the common operations for unsigned integers.
 * It should not be used directly.
 **/
// abstract class UnsignedInteger extends IntegralValue {
//   protected constructor(private readonly subclassCtor: UnsignedIntegerClass, private n: bigint) {
//     super();
//     assert(n < this.subclassCtor.mod, `Value ${n} is too large for ${this.subclassCtor.name}.`);
//   }

//   public build(n: bigint): MemoryValue {
//     return new this.subclassCtor(n);
//   }

//   public add(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor((this.n + rhs.n) & this.subclassCtor.bitmask);
//   }

//   public sub(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     const res: bigint = this.n - rhs.n;
//     return new this.subclassCtor(res >= 0 ? res : res + this.subclassCtor.mod);
//   }

//   public mul(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor((this.n * rhs.n) & this.subclassCtor.bitmask);
//   }

//   public div(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor(this.n / rhs.n);
//   }

//   // No sign extension.
//   public shr(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     // Note that this.n is > 0 by class invariant.
//     return new this.subclassCtor(this.n >> rhs.n);
//   }

//   public shl(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor((this.n << rhs.n) & this.subclassCtor.bitmask);
//   }

//   public and(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor(this.n & rhs.n);
//   }

//   public or(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor(this.n | rhs.n);
//   }

//   public xor(rhs: UnsignedInteger): UnsignedInteger {
//     assert(typeof this == typeof rhs);
//     return new this.subclassCtor(this.n ^ rhs.n);
//   }

//   public not(): UnsignedInteger {
//     return new this.subclassCtor(~this.n & this.subclassCtor.bitmask);
//   }

//   public equals(rhs: UnsignedInteger): boolean {
//     assert(typeof this == typeof rhs);
//     return this.n === rhs.n;
//   }

//   public lt(rhs: UnsignedInteger): boolean {
//     assert(typeof this == typeof rhs);
//     return this.n < rhs.n;
//   }

//   public toBigInt(): bigint {
//     return this.n;
//   }
// }

/** This function creates a class for unsigned integers of a given number of bits. */
function UnsignedIntegerClassFactory(bits: number): any {
  return class NewUintClass extends IntegralValue {
    static readonly mod: bigint = 1n << BigInt(bits);
    static readonly bitmask: bigint = this.mod - 1n;
    private n: bigint;

    public constructor(n: bigint | number) {
      super();
      this.n = BigInt(n);
      assert(n < NewUintClass.mod, `Value ${n} is too large for ${this.constructor.name}.`);
    }
  
    public build(n: bigint): NewUintClass {
      return new NewUintClass(n);
    }
  
    public add(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass((this.n + rhs.n) & NewUintClass.bitmask);
    }
  
    public sub(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      const res: bigint = this.n - rhs.n;
      return new NewUintClass(res >= 0 ? res : res + NewUintClass.mod);
    }
  
    public mul(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass((this.n * rhs.n) & NewUintClass.bitmask);
    }
  
    public div(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass(this.n / rhs.n);
    }
  
    // No sign extension.
    public shr(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      // Note that this.n is > 0 by class invariant.
      return new NewUintClass(this.n >> rhs.n);
    }
  
    public shl(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass((this.n << rhs.n) & NewUintClass.bitmask);
    }
  
    public and(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass(this.n & rhs.n);
    }
  
    public or(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass(this.n | rhs.n);
    }
  
    public xor(rhs: NewUintClass): NewUintClass {
      assert(typeof this == typeof rhs);
      return new NewUintClass(this.n ^ rhs.n);
    }
  
    public not(): NewUintClass {
      return new NewUintClass(~this.n & NewUintClass.bitmask);
    }
  
    public equals(rhs: NewUintClass): boolean {
      assert(typeof this == typeof rhs);
      return this.n === rhs.n;
    }
  
    public lt(rhs: NewUintClass): boolean {
      assert(typeof this == typeof rhs);
      return this.n < rhs.n;
    }
  
    public toBigInt(): bigint {
      return this.n;
    }
  };
}

export const Uint8 = UnsignedIntegerClassFactory(8);
const _Uint16 = UnsignedIntegerClassFactory(16) as typeof IntegralValue;
export class Uint16 extends _Uint16 { constructor(n: bigint | number) { super(n); } };
// export const Uint16 = UnsignedIntegerClassFactory(16);
export const Uint32 = UnsignedIntegerClassFactory(32);
export const Uint64 = UnsignedIntegerClassFactory(64);
export const Uint128 = UnsignedIntegerClassFactory(128);

export class Field extends MemoryValue {
  public static readonly MODULUS: bigint = Fr.MODULUS;
  private readonly rep: Fr;

  constructor(v: number | bigint | Fr) {
    super();
    this.rep = new Fr(v);
  }

  public build(n: bigint): Field {
    return new Field(n);
  }

  public add(rhs: Field): Field {
    return new Field(this.rep.add(rhs.rep));
  }

  public sub(rhs: Field): Field {
    return new Field(this.rep.sub(rhs.rep));
  }

  public mul(rhs: Field): Field {
    return new Field(this.rep.mul(rhs.rep));
  }

  public div(rhs: Field): Field {
    return new Field(this.rep.div(rhs.rep));
  }

  public equals(rhs: Field): boolean {
    return this.rep.equals(rhs.rep);
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

// TODO: Consider automatic conversion when getting undefined values.
export class TaggedMemory {
  // FIXME: memory should be 2^32, but TS doesn't allow for arrays that big.
  static readonly MAX_MEMORY_SIZE = Number((1n << 32n) - 2n);
  private _mem: MemoryValue[];

  constructor() {
    // We do not initialize memory size here because otherwise tests blow up when diffing.
    this._mem = [];
  }

  public get(offset: number): MemoryValue {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    return this.getAs<MemoryValue>(offset);
  }

  public getAs<T>(offset: number): T {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    const word = this._mem[offset];
    return word as T;
  }

  public getSlice(offset: number, size: number): MemoryValue[] {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    assert(offset + size < TaggedMemory.MAX_MEMORY_SIZE);
    return this._mem.slice(offset, offset + size);
  }

  public getSliceAs<T>(offset: number, size: number): T[] {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    assert(offset + size < TaggedMemory.MAX_MEMORY_SIZE);
    return this._mem.slice(offset, offset + size) as T[];
  }

  public getSliceTags(offset: number, size: number): TypeTag[] {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    assert(offset + size < TaggedMemory.MAX_MEMORY_SIZE);
    return this._mem.slice(offset, offset + size).map(TaggedMemory.getTag);
  }

  public set(offset: number, v: MemoryValue) {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    this._mem[offset] = v;
  }

  public setSlice(offset: number, vs: MemoryValue[]) {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    assert(offset + vs.length < TaggedMemory.MAX_MEMORY_SIZE);
    // We may need to extend the memory size, otherwise splice doesn't insert.
    if (offset + vs.length > this._mem.length) {
      this._mem.length = offset + vs.length;
    }
    this._mem.splice(offset, vs.length, ...vs);
  }

  public getTag(offset: number): TypeTag {
    return TaggedMemory.getTag(this._mem[offset]);
  }

  /**
   * Check that the memory at the given offset matches the specified tag.
   */
  public checkTag(tag: TypeTag, offset: number) {
    if (this.getTag(offset) !== tag) {
      throw TagCheckError.forOffset(offset, TypeTag[this.getTag(offset)], TypeTag[tag]);
    }
  }

  public static checkIsIntegralTag(tag: TypeTag) {
    if (![TypeTag.UINT8, TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64, TypeTag.UINT128].includes(tag)) {
      throw TagCheckError.forTag(TypeTag[tag], 'integral');
    }
  }

  /**
   * Check tags for memory at all of the specified offsets.
   */
  public checkTags(tag: TypeTag, ...offsets: number[]) {
    for (const offset of offsets) {
      this.checkTag(tag, offset);
    }
  }

  /**
   * Check tags for all memory in the specified range.
   */
  public checkTagsRange(tag: TypeTag, startOffset: number, size: number) {
    for (let offset = startOffset; offset < startOffset + size; offset++) {
      this.checkTag(tag, offset);
    }
  }

  // TODO: this might be slow, but I don't want to have the types know of their tags.
  // It might be possible to have a map<Prototype, TypeTag>.
  public static getTag(v: MemoryValue | undefined): TypeTag {
    let tag = TypeTag.INVALID;

    if (v === undefined) {
      tag = TypeTag.UNINITIALIZED;
    } else if (v instanceof Field) {
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

  // Truncates the value to fit the type.
  public static integralFromTag(v: bigint | number, tag: TypeTag): IntegralValue {
    v = v as bigint;
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
        throw new Error(`${TypeTag[tag]} is not a valid integral type.`);
    }
  }
}
