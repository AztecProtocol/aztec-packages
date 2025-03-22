import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { computeCalldataHash, computeVarArgsHash } from '../hash/index.js';
import { type ZodFor, schemas } from '../schemas/schemas.js';
import { Vector } from '../types/index.js';

/**
 * A container for storing a list of values and their hash.
 */
export class HashedValues {
  constructor(
    /**
     *  Raw values.
     */
    public readonly values: Fr[],
    /**
     * The hash of the raw values
     */
    public readonly hash: Fr,
  ) {}

  getSize() {
    return this.values.length + 1 /* hash */;
  }

  static get schema(): ZodFor<HashedValues> {
    return z
      .object({
        values: z.array(schemas.Fr),
        hash: schemas.Fr,
      })
      .transform(HashedValues.from);
  }

  static from(fields: FieldsOf<HashedValues>): HashedValues {
    return new HashedValues(...HashedValues.getFields(fields));
  }

  static getFields(fields: FieldsOf<HashedValues>) {
    return [fields.values, fields.hash] as const;
  }

  static random() {
    return new HashedValues([Fr.random(), Fr.random()], Fr.random());
  }

  toBuffer() {
    return serializeToBuffer(new Vector(this.values), this.hash);
  }

  static fromBuffer(buffer: Buffer | BufferReader): HashedValues {
    const reader = BufferReader.asReader(buffer);
    return new HashedValues(reader.readVector(Fr), Fr.fromBuffer(reader));
  }

  // Computes the hash of input arguments or return values for private functions, or for authwit creation.
  static async fromArgs(args: Fr[]) {
    return new HashedValues(args, await computeVarArgsHash(args));
  }

  // Computes the hash of calldata for public functions.
  static async fromCalldata(calldata: Fr[]) {
    return new HashedValues(calldata, await computeCalldataHash(calldata));
  }
}
