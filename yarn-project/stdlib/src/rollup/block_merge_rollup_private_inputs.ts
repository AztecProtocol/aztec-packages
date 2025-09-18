import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { BlockRollupPublicInputs } from './block_rollup_public_inputs.js';

/**
 * Represents inputs of the block merge rollup circuit.
 */
export class BlockMergeRollupPrivateInputs {
  constructor(
    /**
     * Previous rollup data from the 2 block merge or block root rollup circuits that preceded this merge rollup circuit.
     */
    public previousRollups: [
      RollupHonkProofData<BlockRollupPublicInputs>,
      RollupHonkProofData<BlockRollupPublicInputs>,
    ],
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
   * @returns A new BlockMergeRollupPrivateInputs instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new BlockMergeRollupPrivateInputs([
      ProofData.fromBuffer(reader, BlockRollupPublicInputs),
      ProofData.fromBuffer(reader, BlockRollupPublicInputs),
    ]);
  }

  /**
   * Deserializes the inputs from a hex string.
   * @param str - A hex string to deserialize from.
   * @returns A new BlockMergeRollupPrivateInputs instance.
   */
  static fromString(str: string) {
    return BlockMergeRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(BlockMergeRollupPrivateInputs);
  }
}
