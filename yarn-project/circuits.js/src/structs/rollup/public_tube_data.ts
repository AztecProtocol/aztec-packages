import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '../../constants.gen.js';
import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../recursive_proof.js';
import { VkWitnessData } from '../vk_witness_data.js';

export class PublicTubeData {
  constructor(
    public publicInputs: PrivateToPublicKernelCircuitPublicInputs,
    public proof: RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    public vkData: VkWitnessData,
  ) {}

  static empty() {
    return new PublicTubeData(
      PrivateToPublicKernelCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      VkWitnessData.empty(),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicTubeData(
      reader.readObject(PrivateToPublicKernelCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      reader.readObject(VkWitnessData),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }
}
