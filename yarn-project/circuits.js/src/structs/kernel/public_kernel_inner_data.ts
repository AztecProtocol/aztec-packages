import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { NESTED_RECURSIVE_PROOF_LENGTH } from '../../constants.gen.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../recursive_proof.js';
import { VerificationKeyData } from '../verification_key.js';
import { VMCircuitPublicInputs } from './vm_circuit_public_inputs.js';

/**
 * Data of the previous public kernel iteration in the chain of kernels.
 */
export class PublicKernelInnerData {
  constructor(
    /**
     * Public inputs of the previous kernel.
     */
    public publicInputs: VMCircuitPublicInputs,
    /**
     * Proof of the previous kernel.
     */
    public proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    /**
     * Verification key of the previous kernel.
     */
    public vk: VerificationKeyData,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader): PublicKernelInnerData {
    const reader = BufferReader.asReader(buffer);
    return new this(
      reader.readObject(VMCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader, NESTED_RECURSIVE_PROOF_LENGTH),
      reader.readObject(VerificationKeyData),
    );
  }

  static empty(): PublicKernelInnerData {
    return new this(
      VMCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>(NESTED_RECURSIVE_PROOF_LENGTH),
      VerificationKeyData.makeFakeHonk(),
    );
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vk);
  }
}
