import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AVM_PROOF_LENGTH_IN_FIELDS } from '../../constants.gen.js';
import { VMCircuitPublicInputs } from '../kernel/vm_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../recursive_proof.js';
import { VkWitnessData } from '../vk_witness_data.js';

export class AvmProofData {
  constructor(
    public publicInputs: VMCircuitPublicInputs,
    public proof: RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>,
    public vkData: VkWitnessData,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new AvmProofData(
      reader.readObject(VMCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader),
      reader.readObject(VkWitnessData),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }

  static empty() {
    return new AvmProofData(
      VMCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
      VkWitnessData.empty(),
    );
  }
}
