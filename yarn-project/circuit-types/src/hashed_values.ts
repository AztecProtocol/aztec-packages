import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { type ZodFor, schemas } from '@aztec/circuits.js/schemas';
import { Vector } from '@aztec/circuits.js/types';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { z } from 'zod';

/**
 * A container for storing a list of values and their hash.
 */
export class HashedValues {
  private constructor(
    /**
     *  Raw values.
     */
    public readonly values: Fr[],
    /**
     * The hash of the raw values
     */
    public readonly hash: Fr,
  ) {}

  static get schema(): ZodFor<HashedValues> {
    return z.array(schemas.Fr).transform(HashedValues.fromValues);
  }

  toJSON() {
    return this.values;
  }

  static random() {
    return HashedValues.fromValues([Fr.random(), Fr.random()]);
  }

  static async fromValues(values: Fr[]) {
    return new HashedValues(values, await computeVarArgsHash(values));
  }

  toBuffer() {
    return serializeToBuffer(new Vector(this.values), this.hash);
  }

  static fromBuffer(buffer: Buffer | BufferReader): HashedValues {
    const reader = BufferReader.asReader(buffer);
    return new HashedValues(reader.readVector(Fr), Fr.fromBuffer(reader));
  }
}
