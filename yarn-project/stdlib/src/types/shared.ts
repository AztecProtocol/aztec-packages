import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

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

  toBuffer() {
    return serializeToBuffer(this.items.length, this.items);
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

/**
 * CircuitType replaces ComposerType for now. When using Plonk, CircuitType is equivalent to the information of the proving system that will be used
 * to construct a proof. In the future Aztec zk stack, more information must be specified (e.g., the curve over which circuits are  constructed;
 * Plonk vs Honk; zk-SNARK or just SNARK; etc).
 */
export enum CircuitType {
  STANDARD = 0,
  ULTRA = 1,
}
