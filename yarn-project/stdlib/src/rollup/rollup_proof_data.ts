import { NESTED_RECURSIVE_PROOF_LENGTH, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import type { Bufferable } from '@aztec/foundation/serialize';

import type { ParityPublicInputs } from '../parity/index.js';
import { ProofData } from '../proofs/index.js';

/**
 * Represents the data of a nested recursive rollup proof.
 */
export type RollupProofData<T extends Bufferable> = ProofData<T, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>;

export type RootParityProofData = ProofData<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>;
