import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { TxRollupPublicInputs } from './tx_rollup_public_inputs.js';

/**
 * Represents inputs of the merge rollup circuit.
 */
export class TxMergeRollupPrivateInputs {
  constructor(
    /**
     * Previous rollup data from the 2 merge or base rollup circuits that preceded this merge rollup circuit.
     */
    public previousRollups: [RollupHonkProofData<TxRollupPublicInputs>, RollupHonkProofData<TxRollupPublicInputs>],
  ) {}

  /**
   * Serializes the inputs to a buffer.
   * @returns The inputs serialized to a buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.previousRollups);
  }

  /**
   * Serializes the inputs to a hex string.
   * @returns The instance serialized to a hex string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes the inputs from a buffer.
   * @param buffer - The buffer to deserialize from.
   * @returns A new TxMergeRollupPrivateInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new TxMergeRollupPrivateInputs([
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
      ProofData.fromBuffer(reader, TxRollupPublicInputs),
    ]);
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new TxMergeRollupPrivateInputs instance.
   */
  static fromString(str: string) {
    return TxMergeRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(TxMergeRollupPrivateInputs);
  }
}
