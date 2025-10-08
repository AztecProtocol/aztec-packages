import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { CheckpointRollupPublicInputs } from './checkpoint_rollup_public_inputs.js';

/**
 * Represents inputs of the checkpoint merge rollup circuit.
 */
export class CheckpointMergeRollupPrivateInputs {
  constructor(
    /**
     * Previous rollup data from the 2 checkpoint root or merge rollup circuits that preceded this checkpoint merge rollup circuit.
     */
    public previousRollups: [
      RollupHonkProofData<CheckpointRollupPublicInputs>,
      RollupHonkProofData<CheckpointRollupPublicInputs>,
    ],
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousRollups);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CheckpointMergeRollupPrivateInputs([
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
      ProofData.fromBuffer(reader, CheckpointRollupPublicInputs),
    ]);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return CheckpointMergeRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toJSON() {
    return this.toBuffer();
  }

  static get schema() {
    return bufferSchemaFor(CheckpointMergeRollupPrivateInputs);
  }
}
