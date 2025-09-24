import type { CIVC_PROOF_LENGTH, RECURSIVE_PROOF_LENGTH, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
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
  ): ProofData<T, PROOF_LENGTH> {
    const reader = BufferReader.asReader(buffer);
    return new ProofData(reader.readObject(publicInputs), RecursiveProof.fromBuffer(reader), reader.readObject(VkData));
  }
}

export type CivcProofData<T extends Bufferable> = ProofData<T, typeof CIVC_PROOF_LENGTH>;

export type UltraHonkProofData<T extends Bufferable> = ProofData<T, typeof RECURSIVE_PROOF_LENGTH>;

export type RollupHonkProofData<T extends Bufferable> = ProofData<T, typeof RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>;
