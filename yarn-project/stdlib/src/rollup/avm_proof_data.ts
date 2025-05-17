import { AVM_PROOF_LENGTH_IN_FIELDS } from '@aztec/constants';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../proofs/recursive_proof.js';
import { VkData } from '../vks/vk_data.js';

export class AvmProofData {
  constructor(
    public publicInputs: AvmCircuitPublicInputs,
    public proof: RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>,
    public vkData: VkData,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new AvmProofData(
      reader.readObject(AvmCircuitPublicInputs),
      RecursiveProof.fromBuffer(reader),
      reader.readObject(VkData),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.vkData);
  }

  static empty() {
    return new AvmProofData(
      AvmCircuitPublicInputs.empty(),
      makeEmptyRecursiveProof(AVM_PROOF_LENGTH_IN_FIELDS),
      VkData.empty(),
    );
  }
}
