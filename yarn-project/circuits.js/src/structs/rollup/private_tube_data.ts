import { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PrivateToRollupKernelCircuitPublicInputs } from '../kernel/private_to_rollup_kernel_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../recursive_proof.js';
import { VkWitnessData } from '../vk_witness_data.js';

export class PrivateTubeData {
  constructor(
    public publicInputs: PrivateToRollupKernelCircuitPublicInputs,
    public proof: RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>,
    public vkData: VkWitnessData,
  ) {}

  static empty() {
    return new PrivateTubeData(
      PrivateToRollupKernelCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      VkWitnessData.empty(),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateTubeData(
      reader.readObject(PrivateToRollupKernelCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH),
      reader.readObject(VkWitnessData),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }
}
