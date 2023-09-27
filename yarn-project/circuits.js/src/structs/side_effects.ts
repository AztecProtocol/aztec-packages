import { BufferReader } from '@aztec/foundation/serialize';

import { serializeToBuffer } from '../utils/serialize.js';
import { Fr } from './index.js';


/**
 * Essential members and functions of all SideEffect variants
 */
interface SideEffectType {
  /** The actual value associated with the SideEffect */
  value: Fr,
  /** Convert to a buffer */
  toBuffer(): Buffer;
  /** Convert to a field array */
  toFieldArray(): Fr[];
  /** Are all of the fields of the SideEffect zero? */
  isEmpty(): boolean;
}

/**
 * Side-effect object consisting of a value and a counter.
 * cpp/src/aztec3/circuits/abis/side_effects.hpp.
 */
export class SideEffect implements SideEffectType {
  constructor(
    /**
     * The value of the side-effect object.
     */
    public value: Fr,
    /**
     * The side-effect counter.
     */
    public sideEffectCounter: Fr,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.sideEffectCounter);
  }

  /**
   * Convert to an array of fields.
   * @returns The array of fields.
   */
  toFieldArray(): Fr[] {
    return [this.value, this.sideEffectCounter];
  }

  /**
   * Returns whether this instance of side-effect is empty.
   * @returns True if the value and counter both are zero.
   */
  isEmpty() {
    return this.value.isZero() && this.sideEffectCounter.isZero();
  }

  /**
   * Returns an empty instance of side-effect.
   * @returns Side-effect with both value and counter being zero.
   */
  static empty(): SideEffect {
    return new SideEffect(Fr.zero(), Fr.zero());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of SideEffect.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SideEffect {
    const reader = BufferReader.asReader(buffer);
    return new SideEffect(reader.readFr(), reader.readFr());
  }

}

/**
 * Side-effect object consisting of a value, a start counter and an end counter.
 * cpp/src/aztec3/circuits/abis/side_effects.hpp.
 */
export class SideEffectWithRange implements SideEffectType {
  constructor(
    /**
     * The value of the side-effect object.
     */
    public value: Fr,
    /**
     * The start counter.
     */
    public startSideEffectCounter: Fr,
    /**
     * The end counter.
     */
    public endSideEffectCounter: Fr,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.startSideEffectCounter, this.endSideEffectCounter);
  }

  /**
   * Convert to an array of fields.
   * @returns The array of fields.
   */
  toFieldArray(): Fr[] {
    return [this.value, this.startSideEffectCounter, this.endSideEffectCounter];
  }

  /**
   * Returns whether this instance of side-effect is empty.
   * @returns True if the value and both counters are zero.
   */
  isEmpty() {
    return this.value.isZero() && this.startSideEffectCounter.isZero() && this.endSideEffectCounter.isZero();
  }

  /**
   * Returns an empty instance of side-effect.
   * @returns Side-effect with value and counters being zero.
   */
  static empty(): SideEffectWithRange {
    return new SideEffectWithRange(Fr.zero(), Fr.zero(), Fr.zero());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of SideEffectWithRange.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SideEffectWithRange {
    const reader = BufferReader.asReader(buffer);
    return new SideEffectWithRange(reader.readFr(), reader.readFr(), reader.readFr());
  }
}

/**
 * Side-effect object consisting of a value, a start counter and an end counter.
 * cpp/src/aztec3/circuits/abis/side_effects.hpp.
 */
export class SideEffectLinkedToNoteHash implements SideEffectType {
  constructor(
    /**
     * The value of the side-effect object.
     */
    public value: Fr,
    /**
     * The note hash corresponding to the side-effect value.
     */
    public noteHash: Fr,
    /**
     * The counter.
     */
    public sideEffectCounter: Fr,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(): Buffer {
    return serializeToBuffer(this.value, this.noteHash, this.sideEffectCounter);
  }

  /**
   * Convert to an array of fields.
   * @returns The array of fields.
   */
  toFieldArray(): Fr[] {
    return [this.value, this.noteHash, this.sideEffectCounter];
  }

  /**
   * Returns whether this instance of side-effect is empty.
   * @returns True if the value, note hash and counter are all zero.
   */
  isEmpty() {
    return this.value.isZero() && this.noteHash.isZero() && this.sideEffectCounter.isZero();
  }

  /**
   * Returns an empty instance of side-effect.
   * @returns Side-effect with value, note hash and counter being zero.
   */
  static empty(): SideEffectLinkedToNoteHash {
    return new SideEffectLinkedToNoteHash(Fr.zero(), Fr.zero(), Fr.zero());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of SideEffectLinkedToNoteHash.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SideEffectLinkedToNoteHash {
    const reader = BufferReader.asReader(buffer);
    return new SideEffectLinkedToNoteHash(reader.readFr(), reader.readFr(), reader.readFr());
  }

}

/**
 * Convert an array of side effects to an array only non-empty side effects.
 * @param sideEffects - array to be converted
 * @returns the array of the non-empty side effects
 */
export function nonEmptySideEffects(sideEffects: SideEffectType[]): SideEffectType[]{
  return sideEffects.filter!(sideEffect => !sideEffect.isEmpty());
}

/**
 * Convert an array of side effects to an array of their values.
 * @param sideEffects - array to be converted
 * @returns the array of field values (excluding SideEffect metadata like counter)
 */
export function sideEffectArrayToValueArray(sideEffects: SideEffectType[]): Fr[] {
  return sideEffects.map(sideEffect => sideEffect.value);
}