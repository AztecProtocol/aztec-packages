import { BufferReader } from '@aztec/foundation/serialize';
import times from 'lodash.times';
import { assertMemberLength } from '../../index.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '../constants.js';
import { Fr } from '../index.js';

/**
 * Pads an array to the desired length with zero values.
 * @param arr - The array to pad.
 * @param length - The length to pad to.
 * @returns
 */
function padToLength(arr: Fr[], length: number): Fr[] {
  if (arr.length > length) {
    throw Error('Array is already longer than the desired length');
  }
  if (arr.length === length) {
    return arr;
  }
  return arr.concat(Array(length - arr.length).fill(Fr.zero()));
}

/**
 * Type wrapper for L1 to L2 messages.
 */
export class NewL1ToL2Messages {
  /**
   * Commitments to the new l1 to l2 messages.
   */
  public l1ToL2Messages: Fr[];

  constructor(
    /**
     * Commitments to the new l1 to l2 messages.
     */
    messages: Fr[],
  ) {
    this.l1ToL2Messages = padToLength(messages, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    assertMemberLength(this, 'l1ToL2Messages', NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
  }

  static empty(): NewL1ToL2Messages {
    return new NewL1ToL2Messages(Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.zero()));
  }

  static random(): NewL1ToL2Messages {
    return new NewL1ToL2Messages(times(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random));
  }

  static fromBuffer(encoded: Buffer | BufferReader): NewL1ToL2Messages {
    const reader = BufferReader.asReader(encoded);
    return new NewL1ToL2Messages(reader.readVector(Fr));
  }

  length(): number {
    return this.l1ToL2Messages.length;
  }

  encode(): Buffer {
    return serializeToBuffer([this.l1ToL2Messages.length, this.l1ToL2Messages]);
  }

  toBuffer() {
    return serializeToBuffer([this.l1ToL2Messages]);
  }

  toFieldArray(): Fr[] {
    return this.l1ToL2Messages;
  }

  toBufferArray(): Buffer[] {
    return this.l1ToL2Messages.map(message => message.toBuffer());
  }

  toString(): string {
    return this.l1ToL2Messages.map(message => message.toString()).join('\n');
  }
}
