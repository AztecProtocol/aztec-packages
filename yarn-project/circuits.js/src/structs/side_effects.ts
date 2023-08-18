import { BufferReader } from '@aztec/foundation/serialize';

import { serializeToBuffer } from '../utils/serialize.js';
import { Fr } from './index.js';

/**
 * Side-effect object consisting of a value and a counter.
 * cpp/src/aztec3/circuits/abis/side_effects.hpp.
 */
export class SideEffect {
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
export class SideEffectWithRange {
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
export class SideEffectLinkedToNoteHash {
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
