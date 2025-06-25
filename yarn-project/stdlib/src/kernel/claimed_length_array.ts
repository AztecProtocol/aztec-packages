import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import {
  BufferReader,
  type Bufferable,
  FieldReader,
  type Fieldable,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import type { IsEmpty } from './utils/interfaces.js';
import { isEmptyArray } from './utils/order_and_comparison.js';

// Bodge to get typescript to use FieldsOf
type ClaimedLengthArrayFields<T, N extends number> = {
  array: Tuple<T, N>;
  length: number;
};

/**
 * Public inputs to a private circuit.
 */
export class ClaimedLengthArray<T, N extends number> {
  constructor(
    public array: Tuple<T, N>,

    public length: number,
  ) {}

  /**
   * Create PrivateCircuitPublicInputs from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A PrivateCircuitPublicInputs object.
   */
  static from<T, N extends number>(fields: ClaimedLengthArrayFields<T, N>): ClaimedLengthArray<T, N> {
    return new ClaimedLengthArray(...(ClaimedLengthArray.getFields(fields) as [Tuple<T, N>, number]));
  }

  /**
   * Create an array over an integer range, filled with a function 'fn'.
   * This is used over e.g. lodash because it resolved to a tuple type, needed for our fixed array type safety.
   * @param n - The number of integers.
   * @param fn - The generator function.
   * @returns The array of numbers.
   */
  static make<T, N extends number>(length: N, fn: (i: number) => T, offset = 0): ClaimedLengthArray<T, N> {
    return new ClaimedLengthArray<T, N>(makeTuple(length, fn, offset), length);
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer<T, N extends number>(
    buffer: Buffer | BufferReader,
    length: N,
    deserializer: { fromBuffer(reader: BufferReader): T },
  ): ClaimedLengthArray<T, N> {
    const reader = BufferReader.asReader(buffer);
    return new ClaimedLengthArray(reader.readArray(length, deserializer), reader.readNumber());
  }

  static fromFields<T, N extends number>(
    fields: Fr[] | FieldReader,
    length: N,
    deserializer: { fromFields(reader: FieldReader): T },
  ): ClaimedLengthArray<T, N> {
    const reader = FieldReader.asReader(fields);
    return new ClaimedLengthArray(reader.readArray(length, deserializer), reader.readU32());
  }

  public static empty<T, N extends number>(length: N, empty: () => T): ClaimedLengthArray<T, N> {
    return new ClaimedLengthArray(makeTuple(length, empty), 0);
  }

  isEmpty(this: ClaimedLengthArray<IsEmpty, N>) {
    return isEmptyArray(this.array) && this.length == 0;
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields<T, N extends number>(fields: ClaimedLengthArrayFields<T, N>) {
    return [fields.array, fields.length] as const;
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer(this: ClaimedLengthArray<Bufferable, N>): Buffer {
    return serializeToBuffer(...ClaimedLengthArray.getFields(this));
  }

  /**
   * Serialize this as a field array.
   */
  toFields(this: ClaimedLengthArray<Fieldable, N>): Fr[] {
    const fields = serializeToFields(...ClaimedLengthArray.getFields(this));
    return fields;
  }

  public toJSON() {
    return this.toBuffer();
  }

  static schema<T, N extends number>(length: N, deserializer: { fromBuffer(reader: BufferReader): T }) {
    return bufferSchemaFor({
      fromBuffer: (buf: Buffer) => ClaimedLengthArray.fromBuffer(buf, length, deserializer),
    });
  }
}
