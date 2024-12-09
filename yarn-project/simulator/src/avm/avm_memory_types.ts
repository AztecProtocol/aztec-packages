import {
  MEM_TAG_FF,
  MEM_TAG_U1,
  MEM_TAG_U8,
  MEM_TAG_U16,
  MEM_TAG_U32,
  MEM_TAG_U64,
  MEM_TAG_U128,
} from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type FunctionsOf } from '@aztec/foundation/types';

import { strict as assert } from 'assert';

import { InstructionExecutionError, InvalidTagValueError, TagCheckError } from './errors.js';
import { Addressing, AddressingMode } from './opcodes/addressing_mode.js';

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
  INVALID,
}

// Lazy interface definition for tagged memory
export type TaggedMemoryInterface = FunctionsOf<TaggedMemory>;

export class TaggedMemory implements TaggedMemoryInterface {
  static readonly log: DebugLogger = createDebugLogger('aztec:avm_simulator:memory');

  // Whether to track and validate memory accesses for each instruction.
  static readonly TRACK_MEMORY_ACCESSES = process.env.NODE_ENV === 'test';

  // FIXME: memory should be 2^32, but TS max array size is: 2^32 - 1
  static readonly MAX_MEMORY_SIZE = Number((1n << 32n) - 1n);
  private _mem: MemoryValue[];

  constructor() {
    // We do not initialize memory size here because otherwise tests blow up when diffing.
    this._mem = [];
  }

  public getMaxMemorySize(): number {
    return TaggedMemory.MAX_MEMORY_SIZE;
  }

  /** Returns a MeteredTaggedMemory instance to track the number of reads and writes if TRACK_MEMORY_ACCESSES is set. */
  public track(type: string = 'instruction'): TaggedMemoryInterface {
    return TaggedMemory.TRACK_MEMORY_ACCESSES ? new MeteredTaggedMemory(this, type) : this;
  }

  public get(offset: number): MemoryValue {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    const value = this.getAs<MemoryValue>(offset);
    return value;
  }

  public getAs<T>(offset: number): T {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    const word = this._mem[offset];
    TaggedMemory.log.trace(`get(${offset}) = ${word}`);
    if (word === undefined) {
      TaggedMemory.log.debug(`WARNING: Memory at offset ${offset} is undefined!`);
      return new Field(0) as T;
    }
    return word as T;
  }

  public getSlice(offset: number, size: number): MemoryValue[] {
    assert(offset + size <= TaggedMemory.MAX_MEMORY_SIZE);
    const value = this._mem.slice(offset, offset + size);
    TaggedMemory.log.trace(`getSlice(${offset}, ${size}) = ${value}`);
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) {
        value[i] = new Field(0);
      }
    }
    assert(value.length === size, `Expected slice of size ${size}, got ${value.length}.`);
    return value;
  }

  public getSliceAs<T>(offset: number, size: number): T[] {
    assert(offset + size <= TaggedMemory.MAX_MEMORY_SIZE);
    return this.getSlice(offset, size) as T[];
  }

  public getSliceTags(offset: number, size: number): TypeTag[] {
    assert(offset + size <= TaggedMemory.MAX_MEMORY_SIZE);
    return this._mem.slice(offset, offset + size).map(TaggedMemory.getTag);
  }

  public set(offset: number, v: MemoryValue) {
    assert(offset < TaggedMemory.MAX_MEMORY_SIZE);
    this._mem[offset] = v;
    TaggedMemory.log.trace(`set(${offset}, ${v})`);
  }

  public setSlice(offset: number, vs: MemoryValue[]) {
    assert(offset + vs.length <= TaggedMemory.MAX_MEMORY_SIZE);
    // We may need to extend the memory size, otherwise splice doesn't insert.
    if (offset + vs.length > this._mem.length) {
      this._mem.length = offset + vs.length;
    }
    this._mem.splice(offset, vs.length, ...vs);
    TaggedMemory.log.trace(`setSlice(${offset}, ${vs})`);
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

  public checkIsValidMemoryOffsetTag(offset: number) {
    this.checkTag(TypeTag.UINT32, offset);
  }

  public static checkIsIntegralTag(tag: TypeTag) {
    if (
      ![TypeTag.UINT1, TypeTag.UINT8, TypeTag.UINT16, TypeTag.UINT32, TypeTag.UINT64, TypeTag.UINT128].includes(tag)
    ) {
      throw TagCheckError.forTag(TypeTag[tag], 'integral');
    }
  }

  public static checkIsValidTag(tagNumber: number) {
    if (
      ![
        TypeTag.UINT1,
        TypeTag.UINT8,
        TypeTag.UINT16,
        TypeTag.UINT32,
        TypeTag.UINT64,
        TypeTag.UINT128,
        TypeTag.FIELD,
      ].includes(tagNumber)
    ) {
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
  public checkTagsAreSame(...offsets: number[]) {
    const tag = this.getTag(offsets[0]);
    for (let i = 1; i < offsets.length; i++) {
      this.checkTag(tag, offsets[i]);
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
      tag = TypeTag.FIELD; // uninitialized memory is Field(0)
    } else if (v instanceof Field) {
      tag = TypeTag.FIELD;
    } else if (v instanceof Uint1) {
      tag = TypeTag.UINT1;
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

  /** No-op. Implemented here for compatibility with the MeteredTaggedMemory. */
  public assert(_operations: Partial<MemoryOperations & { addressing: Addressing }>) {}
}

/** Tagged memory wrapper with metering for each memory read and write operation. */
export class MeteredTaggedMemory implements TaggedMemoryInterface {
  private reads: number = 0;
  private writes: number = 0;

  constructor(private wrapped: TaggedMemory, private type: string = 'instruction') {}

  /** Returns the number of reads and writes tracked so far and resets them to zero. */
  public reset(): MemoryOperations {
    const stats = { reads: this.reads, writes: this.writes };
    this.reads = 0;
    this.writes = 0;
    return stats;
  }

  /**
   * Asserts that the exact number of memory operations have been performed.
   * Indirect represents the flags for indirect accesses: each bit set to one counts as an extra read.
   */
  public assert(operations: Partial<MemoryOperations & { addressing: Addressing }>) {
    const {
      reads: expectedReads,
      writes: expectedWrites,
      addressing,
    } = { reads: 0, writes: 0, addressing: new Addressing([]), ...operations };

    const totalExpectedReads =
      expectedReads + addressing.count(AddressingMode.INDIRECT) + addressing.count(AddressingMode.RELATIVE);
    const { reads: actualReads, writes: actualWrites } = this.reset();
    if (actualReads !== totalExpectedReads) {
      throw new InstructionExecutionError(
        `Incorrect number of memory reads for ${this.type}: expected ${totalExpectedReads} but executed ${actualReads}`,
      );
    }
    if (actualWrites !== expectedWrites) {
      throw new InstructionExecutionError(
        `Incorrect number of memory writes for ${this.type}: expected ${expectedWrites} but executed ${actualWrites}`,
      );
    }
  }

  public getMaxMemorySize(): number {
    return this.wrapped.getMaxMemorySize();
  }

  public track(type: string = 'instruction'): MeteredTaggedMemory {
    return new MeteredTaggedMemory(this.wrapped, type);
  }

  public get(offset: number): MemoryValue {
    this.reads++;
    return this.wrapped.get(offset);
  }

  public getSliceAs<T>(offset: number, size: number): T[] {
    this.reads += size;
    return this.wrapped.getSliceAs<T>(offset, size);
  }

  public getAs<T>(offset: number): T {
    this.reads++;
    return this.wrapped.getAs(offset);
  }

  public getSlice(offset: number, size: number): MemoryValue[] {
    this.reads += size;
    return this.wrapped.getSlice(offset, size);
  }

  public set(offset: number, v: MemoryValue): void {
    this.writes++;
    this.wrapped.set(offset, v);
  }

  public setSlice(offset: number, vs: MemoryValue[]): void {
    this.writes += vs.length;
    this.wrapped.setSlice(offset, vs);
  }

  public getSliceTags(offset: number, size: number): TypeTag[] {
    return this.wrapped.getSliceTags(offset, size);
  }

  public getTag(offset: number): TypeTag {
    return this.wrapped.getTag(offset);
  }

  public checkTag(tag: TypeTag, offset: number): void {
    this.wrapped.checkTag(tag, offset);
  }

  public checkIsValidMemoryOffsetTag(offset: number): void {
    this.wrapped.checkIsValidMemoryOffsetTag(offset);
  }

  public checkTags(tag: TypeTag, ...offsets: number[]): void {
    this.wrapped.checkTags(tag, ...offsets);
  }

  public checkTagsAreSame(...offsets: number[]): void {
    this.wrapped.checkTagsAreSame(...offsets);
  }

  public checkTagsRange(tag: TypeTag, startOffset: number, size: number): void {
    this.wrapped.checkTagsRange(tag, startOffset, size);
  }
}

/** Tracks number of memory reads and writes. */
export type MemoryOperations = {
  /** How many total reads are performed. Slice reads are count as one per element. */
  reads: number;
  /** How many total writes are performed. Slice writes are count as one per element. */
  writes: number;
};
