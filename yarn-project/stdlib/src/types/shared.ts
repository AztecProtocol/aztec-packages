import { BufferSink, type Bufferable, type Sinkable, serializeToSink } from '@aztec/foundation/serialize';

/**
 * Implementation of a vector. Matches how we are serializing and deserializing vectors in cpp (length in the first position, followed by the items).
 */
export class Vector<T extends Bufferable> {
  constructor(
    /**
     * Items in the vector.
     */
    public items: T[],
  ) {}

  toBuffer(): Buffer;
  toBuffer(sink: BufferSink): void;
  toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    serializeToSink(sink, this.items.length, this.items as Sinkable[]);
  }

  toFriendlyJSON() {
    return this.items;
  }
}

/**
 * A type alias for a 32-bit unsigned integer.
 */
export type UInt32 = number;

/**
 * A type alias for a 64-bit unsigned integer.
 */
export type UInt64 = bigint;

/**
 * A type alias for a 128-bit unsigned integer.
 */
export type UInt128 = bigint;
