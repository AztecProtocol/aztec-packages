import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, BufferSink, serializeToSink } from '@aztec/foundation/serialize';
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
    return HashedValues.schemaFor();
  }

  /**
   * Returns a schema that additionally rejects more than `maxValues` values. The bound belongs to the caller
   * rather than to this class: the same container carries public calldata, private call arguments and authwit
   * arguments, and those have different limits.
   */
  static schemaFor(maxValues?: number): ZodFor<HashedValues> {
    const values = maxValues === undefined ? z.array(schemas.Fr) : z.array(schemas.Fr).max(maxValues);
    return z.object({ values, hash: schemas.Fr }).transform(HashedValues.from);
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

  toBuffer(): Buffer;
  toBuffer(sink: BufferSink): void;
  toBuffer(sink?: BufferSink): Buffer | void {
    if (!sink) {
      return BufferSink.serialize(this);
    }
    serializeToSink(sink, new Vector(this.values), this.hash);
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
