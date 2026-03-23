import { BatchedBlob } from '@aztec/blob-lib';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { RootRollupPublicInputs } from '../rollup/root_rollup_public_inputs.js';
import { Proof } from './proof.js';

/**
 * Serializable payload containing a complete epoch proof ready for L1 submission.
 * Produced by the TopTreeJob and consumed by the RootRollupPublishJob.
 */
export class EpochProofPayload {
  constructor(
    public readonly publicInputs: RootRollupPublicInputs,
    public readonly proof: Proof,
    public readonly batchedBlobInputs: BatchedBlob,
  ) {}

  toBuffer(): Buffer {
    return serializeToBuffer(this.publicInputs, this.proof, this.batchedBlobInputs);
  }

  static fromBuffer(buffer: Buffer | BufferReader): EpochProofPayload {
    const reader = BufferReader.asReader(buffer);
    return new EpochProofPayload(
      RootRollupPublicInputs.fromBuffer(reader),
      Proof.fromBuffer(reader),
      BatchedBlob.fromBuffer(reader),
    );
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): EpochProofPayload {
    return EpochProofPayload.fromBuffer(hexToBuffer(str));
  }
}
