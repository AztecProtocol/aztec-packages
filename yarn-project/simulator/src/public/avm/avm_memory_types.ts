import {
  MEM_TAG_FF,
  MEM_TAG_U1,
  MEM_TAG_U8,
  MEM_TAG_U16,
  MEM_TAG_U32,
  MEM_TAG_U64,
  MEM_TAG_U128,
} from '@aztec/constants';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FunctionsOf } from '@aztec/foundation/types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { strict as assert } from 'assert';

import { InvalidTagValueError, MemorySliceOutOfRangeError, TagCheckError } from './errors.js';

/** MemoryValue gathers the common operations for all memory types. */
export abstract class MemoryValue {
  public abstract add(rhs: MemoryValue): MemoryValue;
  public abstract sub(rhs: MemoryValue): MemoryValue;
  public abstract mul(rhs: MemoryValue): MemoryValue;
  public abstract div(rhs: MemoryValue): MemoryValue;

  public abstract equals(rhs: MemoryValue): boolean;
  public abstract lt(rhs: MemoryValue): boolean;

  // We need this to be able to build an instance of the subclasses.
  public abstract build(n: bigint): MemoryValue;

  // Use sparingly.
  public abstract toBigInt(): bigint;
  public getTag(): TypeTag {
    return TaggedMemory.getTag(this);
  }

  // To Buffer
  public abstract toBuffer(): Buffer;

  // To field
  public toFr(): Fr {
    return new Fr(this.toBigInt());
  }

  public toAztecAddress(): AztecAddress {
    return new AztecAddress(this.toFr());
  }

  // To number. Throws if exceeds max safe int.
  public toNumber(): number {
    return this.toFr().toNumber();
  }

  public toString(): string {
    return `${this.constructor.name}(0x${this.toBigInt().toString(16)})`;
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
}

/**
 * This function creates a class for unsigned integers of a given number of bits.
 * In TypeScript terms, it's a class mixin.
 **/
function UnsignedIntegerClassFactory(bits: number) {
  return class NewUintClass extends IntegralValue {
    static readonly mod: bigint = 1n << BigInt(bits);
    static readonly bitmask: bigint = this.mod - 1n;
    public readonly n: bigint; // Cannot be private due to TS limitations.

    public constructor(n: bigint | number) {
      super();
      this.n = BigInt(n);
      assert(n < NewUintClass.mod, `Value ${n} is too large for ${this.constructor.name}.`);
    }

    public build(n: bigint): NewUintClass {
      return new this.constructor.prototype.constructor(n);
    }

    public add(rhs: NewUintClass): NewUintClass {
      return this.build((this.n + rhs.n) & NewUintClass.bitmask);
    }

    public sub(rhs: NewUintClass): NewUintClass {
      const res: bigint = this.n - rhs.n;
      return this.build(res >= 0 ? res : res + NewUintClass.mod);
    }

    public mul(rhs: NewUintClass): NewUintClass {
      return this.build((this.n * rhs.n) & NewUintClass.bitmask);
    }

    public div(rhs: NewUintClass): NewUintClass {
      return this.build(this.n / rhs.n);
    }

    // No sign extension.
    public shr(rhs: NewUintClass): NewUintClass {
      // Note that this.n is > 0 by class invariant.
      return this.build(this.n >> rhs.n);
    }

    public shl(rhs: NewUintClass): NewUintClass {
      return this.build((this.n << rhs.n) & NewUintClass.bitmask);
    }

    public and(rhs: NewUintClass): NewUintClass {
      return this.build(this.n & rhs.n);
    }

    public or(rhs: NewUintClass): NewUintClass {
      return this.build(this.n | rhs.n);
    }

    public xor(rhs: NewUintClass): NewUintClass {
      return this.build(this.n ^ rhs.n);
    }

    public not(): NewUintClass {
      return this.build(~this.n & NewUintClass.bitmask);
    }

    public equals(rhs: NewUintClass): boolean {
      return this.n === rhs.n;
    }

    public lt(rhs: NewUintClass): boolean {
      return this.n < rhs.n;
    }

    public toBigInt(): bigint {
      return this.n;
    }

    public toBuffer(): Buffer {
      if (bits < 8) {
        return toBufferBE(this.n, 1);
      }
      return toBufferBE(this.n, bits / 8);
    }
  };
}

// Now we can create the classes for each unsigned integer type.
// We extend instead of just assigning so that the class has the right name.
// Otherwise they are all called "NewUintClass".
export class Uint1 extends UnsignedIntegerClassFactory(1) {}
export class Uint8 extends UnsignedIntegerClassFactory(8) {}
export class Uint16 extends UnsignedIntegerClassFactory(16) {}
export class Uint32 extends UnsignedIntegerClassFactory(32) {}
export class Uint64 extends UnsignedIntegerClassFactory(64) {}
export class Uint128 extends UnsignedIntegerClassFactory(128) {}

export class Field extends MemoryValue {
  public static readonly MODULUS: bigint = Fr.MODULUS;
  private readonly rep: Fr;

  constructor(v: number | bigint | Fr | Buffer) {
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

  // Euclidean division.
  public div(rhs: Field): Field {
    return new Field(this.rep.ediv(rhs.rep));
  }

  // Field division.
  public fdiv(rhs: Field): Field {
    return new Field(this.rep.div(rhs.rep));
  }

  public equals(rhs: Field): boolean {
    return this.rep.equals(rhs.rep);
  }

  public lt(rhs: Field): boolean {
    return this.rep.lt(rhs.rep);
  }

  public toBigInt(): bigint {
    return this.rep.toBigInt();
  }

  public toBuffer(): Buffer {
    return this.rep.toBuffer();
  }
}

export enum TypeTag {
  FIELD = MEM_TAG_FF,
  UINT1 = MEM_TAG_U1,
  UINT8 = MEM_TAG_U8,
  UINT16 = MEM_TAG_U16,
  UINT32 = MEM_TAG_U32,
  UINT64 = MEM_TAG_U64,
  UINT128 = MEM_TAG_U128,
  INVALID = MEM_TAG_U128 + 1,
}

// Lazy interface definition for tagged memory
export type TaggedMemoryInterface = FunctionsOf<TaggedMemory>;

export class TaggedMemory implements TaggedMemoryInterface {
  static readonly log: Logger = createLogger('simulator:avm:memory');

  // Whether to track and validate memory accesses for each instruction.
  static readonly TRACK_MEMORY_ACCESSES = process.env.NODE_ENV === 'test';

  // Memory is modelled by a map with key type being number.
  // We however restrict the keys to be non-negative integers smaller than
  // MAX_MEMORY_SIZE.
  static readonly MAX_MEMORY_SIZE = Number(1n << 32n);
  private _mem: Map<number, MemoryValue>;

  constructor() {
    this._mem = new Map<number, MemoryValue>();
  }

  public getMaxMemorySize(): number {
    return TaggedMemory.MAX_MEMORY_SIZE;
  }

  public get(offset: number): MemoryValue {
    return this.getAs<MemoryValue>(offset);
  }

  public getAs<T>(offset: number): T {
    assert(Number.isInteger(offset) && offset < TaggedMemory.MAX_MEMORY_SIZE);
    const word = this._mem.get(offset);
    //TaggedMemory.log.trace(`get(${offset}) = ${word}`);
    if (word === undefined) {
      TaggedMemory.log.debug(`WARNING: Memory at offset ${offset} is undefined!`);
      return new Field(0) as T;
    }
    return word as T;
  }

  public getSlice(offset: number, size: number): MemoryValue[] {
    assert(Number.isInteger(offset) && Number.isInteger(size));

    if (offset + size > TaggedMemory.MAX_MEMORY_SIZE) {
      throw new MemorySliceOutOfRangeError(offset, size);
    }

    const slice = new Array<MemoryValue>(size);

    for (let i = 0; i < size; i++) {
      slice[i] = this._mem.get(offset + i) ?? new Field(0);
    }

    TaggedMemory.log.trace(`getSlice(${offset}, ${size}) = ${slice}`);
    return slice;
  }

  public getSliceAs<T>(offset: number, size: number): T[] {
    return this.getSlice(offset, size) as T[];
  }

  public getSliceTags(offset: number, size: number): TypeTag[] {
    return this.getSlice(offset, size).map(TaggedMemory.getTag);
  }

  public set(offset: number, v: MemoryValue) {
    assert(Number.isInteger(offset) && offset < TaggedMemory.MAX_MEMORY_SIZE);
    this._mem.set(offset, v);
    //TaggedMemory.log.trace(`set(${offset}, ${v})`);
  }

  public setSlice(offset: number, slice: MemoryValue[]) {
    assert(Number.isInteger(offset));

    if (offset + slice.length > TaggedMemory.MAX_MEMORY_SIZE) {
      throw new MemorySliceOutOfRangeError(offset, slice.length);
    }

    slice.forEach((element, idx) => {
      this._mem.set(offset + idx, element);
    });
    TaggedMemory.log.trace(`setSlice(${offset}, ${slice})`);
  }

  public getTag(offset: number): TypeTag {
    assert(Number.isInteger(offset) && offset < TaggedMemory.MAX_MEMORY_SIZE);
    return TaggedMemory.getTag(this._mem.get(offset));
  }

  /**
   * Check that the memory at the given offset matches the specified tag.
   */
  public checkTag(tag: TypeTag, offset: number) {
    const gotTag = this.getTag(offset);
    if (gotTag !== tag) {
      throw TagCheckError.forOffset(offset, TypeTag[gotTag], TypeTag[tag]);
    }
  }

  public static isValidMemoryAddressTag(tag: TypeTag) {
    return tag === TypeTag.UINT32;
  }

  public static checkIsIntegralTag(tag: TypeTag) {
    if (!INTEGRAL_TAGS.has(tag)) {
      throw TagCheckError.forTag(TypeTag[tag], 'integral');
    }
  }

  public static checkIsValidTag(tagNumber: number) {
    if (!VALID_TAGS.has(tagNumber)) {
      throw new InvalidTagValueError(tagNumber);
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
   * Check that all tags at the given offsets are the same.
   */
  public checkTagsAreSame(offset0: number, offset1: number) {
    const tag0 = this.getTag(offset0);
    this.checkTag(tag0, offset1);
  }

  /**
   * Check tags for all memory in the specified range.
   */
  public checkTagsRange(tag: TypeTag, startOffset: number, size: number) {
    for (let offset = startOffset; offset < startOffset + size; offset++) {
      this.checkTag(tag, offset);
    }
  }

  public static getTag(v: MemoryValue | undefined): TypeTag {
    if (v === undefined) {
      return TypeTag.FIELD; // uninitialized memory is Field(0)
    } else {
      return TAG_FOR_MEM_VAL.get(v.constructor.name) ?? TypeTag.INVALID;
    }
  }

  // Truncates the value to fit the type.
  public static buildFromTagTruncating(v: bigint | number, tag: TypeTag): MemoryValue {
    v = BigInt(v);
    switch (tag) {
      case TypeTag.FIELD:
        return new Field(v);
      case TypeTag.UINT1:
        return new Uint1(v & 1n);
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
        throw new InvalidTagValueError(tag);
    }
  }
}

const TAG_FOR_MEM_VAL = new Map<string, TypeTag>([
  ['Field', TypeTag.FIELD],
  ['Uint1', TypeTag.UINT1],
  ['Uint8', TypeTag.UINT8],
  ['Uint16', TypeTag.UINT16],
  ['Uint32', TypeTag.UINT32],
  ['Uint64', TypeTag.UINT64],
  ['Uint128', TypeTag.UINT128],
]);

const VALID_TAGS = new Set([
  TypeTag.FIELD,
  TypeTag.UINT1,
  TypeTag.UINT8,
  TypeTag.UINT16,
  TypeTag.UINT32,
  TypeTag.UINT64,
  TypeTag.UINT128,
]);

const INTEGRAL_TAGS = new Set([
  TypeTag.UINT1,
  TypeTag.UINT8,
  TypeTag.UINT16,
  TypeTag.UINT32,
  TypeTag.UINT64,
  TypeTag.UINT128,
]);
