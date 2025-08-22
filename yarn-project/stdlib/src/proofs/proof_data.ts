import { BufferReader, type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

import { RecursiveProof } from '../proofs/recursive_proof.js';
import { VkData } from '../vks/index.js';

/**
 * Represents the data of a recursive proof.
 */
export class ProofData<T extends Bufferable, PROOF_LENGTH extends number> {
  constructor(
    public publicInputs: T,
    public proof: RecursiveProof<PROOF_LENGTH>,
    public vkData: VkData,
  ) {}

  public toBuffer(): Buffer {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }

  public static fromBuffer<T extends Bufferable, PROOF_LENGTH extends number>(
    buffer: Buffer | BufferReader,
    publicInputs: {
      fromBuffer: (reader: BufferReader) => T;
    },
    proofLength?: PROOF_LENGTH,
  ): ProofData<T, PROOF_LENGTH> {
    const reader = BufferReader.asReader(buffer);
    return new ProofData(
      reader.readObject(publicInputs),
      RecursiveProof.fromBuffer(reader, proofLength),
      reader.readObject(VkData),
    );
  }
}
