import { AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';

import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import type { ProofDataForFixedVk } from '../proofs/proof_data.js';

export type AvmProofData = ProofDataForFixedVk<AvmCircuitPublicInputs, typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;
