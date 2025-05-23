import { AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { RecursiveProof, makeEmptyRecursiveProof } from '../proofs/recursive_proof.js';
import { VkData } from '../vks/vk_data.js';

export class AvmProofData {
  constructor(
    public publicInputs: AvmCircuitPublicInputs,
    public proof: RecursiveProof<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>,
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
      makeEmptyRecursiveProof(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED),
      VkData.empty(),
    );
  }
}

// TODO(#14234)[Unconditional PIs validation]: remove this function.
export function enhanceProofWithPiValidationFlag(proof: Fr[], skipPublicInputsValidation: boolean): Fr[] {
  const skipPublicInputsField = skipPublicInputsValidation ? new Fr(1) : new Fr(0);
  return [skipPublicInputsField].concat(proof).slice(0, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
}
