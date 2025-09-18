import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { CheckpointRollupPublicInputs } from './checkpoint_rollup_public_inputs.js';

/**
 * Represents inputs of the root rollup circuit.
 */
export class RootRollupPrivateInputs {
  constructor(
    /**
     * The previous rollup data.
     * Note: Root rollup circuit is the latest circuit the chain of circuits and the previous rollup data is the data
     * from 2 checkpoint root/merge/padding circuits.
     */
    public previousRollups: [
      RollupHonkProofData<CheckpointRollupPublicInputs>,
      RollupHonkProofData<CheckpointRollupPublicInputs>,
    ],
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns - The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(...RootRollupPrivateInputs.getFields(this));
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Creates a new instance from fields.
   * @param fields - Fields to create the instance from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static from(fields: FieldsOf<RootRollupPrivateInputs>) {
    return new RootRollupPrivateInputs(...RootRollupPrivateInputs.getFields(fields));
  }

  /**
   * Extracts fields from an instance.
   * @param fields - Fields to create the instance from.
   * @returns An array of fields.
   */
  static getFields(fields: FieldsOf<RootRollupPrivateInputs>) {
    return [fields.previousRollups] as const;
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - A buffer to deserialize from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new RootRollupPrivateInputs([
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
    ]);
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new RootRollupPrivateInputs instance.
   */
  static fromString(str: string) {
    return RootRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(RootRollupPrivateInputs);
  }
}
