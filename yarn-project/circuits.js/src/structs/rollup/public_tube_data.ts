import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { RECURSIVE_PROOF_LENGTH } from '../../constants.gen.js';
import { KernelCircuitPublicInputs } from '../kernel/kernel_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../recursive_proof.js';
import { VkWitnessData } from '../vk_witness_data.js';

export class PublicTubeData {
  constructor(
    public publicInputs: KernelCircuitPublicInputs,
    public proof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>,
    public vkData: VkWitnessData,
  ) {}

  static empty() {
    return new PublicTubeData(
      KernelCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof(RECURSIVE_PROOF_LENGTH),
      VkWitnessData.empty(),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicTubeData(
      reader.readObject(KernelCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader, RECURSIVE_PROOF_LENGTH),
      reader.readObject(VkWitnessData),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }
}
