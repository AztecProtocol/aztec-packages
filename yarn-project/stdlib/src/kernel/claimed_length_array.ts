import type { Fr } from '@aztec/foundation/fields';
import {
  BufferReader,
  FieldReader,
  type Serializable,
  type Tuple,
  serializeToBuffer,
  serializeToFields,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class ClaimedLengthArray<T extends Serializable, N extends number> {
  constructor(
    public array: Tuple<T, N>,
    // Named `claimedLength` instead of `length` to avoid being confused with array.length.
    public claimedLength: number,
  ) {}

  static fromBuffer<T extends Serializable, N extends number>(
    buffer: Buffer | BufferReader,
    deserializer: {
      fromBuffer: (reader: BufferReader) => T;
    },
    arrayLength: N,
  ): ClaimedLengthArray<T, N> {
    const reader = BufferReader.asReader(buffer);
    const array = reader.readArray(arrayLength, deserializer);
    const claimedLength = reader.readNumber();
    return new ClaimedLengthArray(array, claimedLength);
  }

  toBuffer() {
    return serializeToBuffer(this.array, this.claimedLength);
  }

  static fromFields<T extends Serializable, N extends number>(
    fields: Fr[] | FieldReader,
    deserializer: {
      fromFields: (reader: FieldReader) => T;
    },
    arrayLength: N,
  ): ClaimedLengthArray<T, N> {
    const reader = FieldReader.asReader(fields);
    const array = reader.readArray(arrayLength, deserializer);
    const claimedLength = reader.readU32();
    return new ClaimedLengthArray(array, claimedLength);
  }

  toFields() {
    return serializeToFields(this.array, this.claimedLength);
  }

  static empty<T extends Serializable, N extends number>(
    elem: { empty: () => T },
    arraySize: number,
  ): ClaimedLengthArray<T, N> {
    const array = Array(arraySize).fill(elem.empty()) as Tuple<T, N>;
    return new ClaimedLengthArray(array, 0);
  }

  isEmpty() {
    return this.claimedLength === 0;
  }

  getActiveItems(): T[] {
    return this.array.slice(0, this.claimedLength);
  }

  getSize() {
    return this.toBuffer().length;
  }

  [inspect.custom]() {
    return `ClaimedLengthArray {
      array: [${this.getActiveItems()
        .map(x => inspect(x))
        .join(', ')}],
      claimedLength: ${this.claimedLength},
    `;
  }
}

export function ClaimedLengthArrayFromBuffer<T extends Serializable, N extends number>(
  deserializer: {
    fromBuffer: (reader: BufferReader) => T;
  },
  arrayLength: N,
): {
  fromBuffer: (reader: BufferReader) => ClaimedLengthArray<T, N>;
} {
  return { fromBuffer: (reader: BufferReader) => ClaimedLengthArray.fromBuffer(reader, deserializer, arrayLength) };
}

export function ClaimedLengthArrayFromFields<T extends Serializable, N extends number>(
  deserializer: {
    fromFields: (reader: FieldReader) => T;
  },
  arrayLength: N,
): {
  fromFields: (reader: FieldReader) => ClaimedLengthArray<T, N>;
} {
  return { fromFields: (reader: FieldReader) => ClaimedLengthArray.fromFields(reader, deserializer, arrayLength) };
}
