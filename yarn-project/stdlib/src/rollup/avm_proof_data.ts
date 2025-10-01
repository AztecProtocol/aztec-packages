import { AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import type { ProofData } from '../proofs/proof_data.js';

export type AvmProofData = ProofData<AvmCircuitPublicInputs, typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;

// TODO(#14234)[Unconditional PIs validation]: remove this function.
export function enhanceProofWithPiValidationFlag(proof: Fr[], skipPublicInputsValidation: boolean): Fr[] {
  const skipPublicInputsField = skipPublicInputsValidation ? new Fr(1) : new Fr(0);
  return [skipPublicInputsField].concat(proof).slice(0, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED);
}
