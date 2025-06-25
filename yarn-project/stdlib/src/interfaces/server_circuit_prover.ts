import type {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';

import type { AvmCircuitInputs } from '../avm/avm.js';
import type { BaseParityInputs } from '../parity/base_parity_inputs.js';
import type { ParityPublicInputs } from '../parity/parity_public_inputs.js';
import type { RootParityInputs } from '../parity/root_parity_inputs.js';
import type { BaseOrMergeRollupPublicInputs } from '../rollup/base_or_merge_rollup_public_inputs.js';
import type { BlockMergeRollupInputs } from '../rollup/block_merge_rollup.js';
import type { BlockRootOrBlockMergePublicInputs } from '../rollup/block_root_or_block_merge_public_inputs.js';
import type { BlockRootRollupInputs, SingleTxBlockRootRollupInputs } from '../rollup/block_root_rollup.js';
import type { EmptyBlockRootRollupInputs } from '../rollup/empty_block_root_rollup_inputs.js';
import type { MergeRollupInputs } from '../rollup/merge_rollup.js';
import type { PrivateBaseRollupInputs } from '../rollup/private_base_rollup_inputs.js';
import type { PublicBaseRollupInputs } from '../rollup/public_base_rollup_inputs.js';
import type { RootRollupInputs, RootRollupPublicInputs } from '../rollup/root_rollup.js';
import type { TubeInputs } from '../rollup/tube_inputs.js';
import type { Tx } from '../tx/tx.js';
import type { ProofAndVerificationKey, PublicInputsAndRecursiveProof } from './proving-job.js';

/**
 * Generates proofs for parity and rollup circuits.
 */
export interface ServerCircuitProver {
  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBaseParityProof(
    inputs: BaseParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootParityProof(
    inputs: RootParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getPrivateBaseRollupProof(
    baseRollupInput: PrivateBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Get a recursively verified client IVC proof (making it a compatible honk proof for the rest of the rollup).
   * @param input - Input to the circuit.
   */
  getTubeProof(
    tubeInput: TubeInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getMergeRollupProof(
    input: MergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockRootRollupProof(
    input: BlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  getSingleTxBlockRootRollupProof(
    input: SingleTxBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootRollupProof(
    input: RootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>>;

  /**
   * Create a proof for the AVM circuit.
   * @param inputs - Inputs to the AVM circuit.
   */
  getAvmProof(
    inputs: AvmCircuitInputs,
    skipPublicInputsValidation?: boolean, // TODO(#14234)[Unconditional PIs validation]: Remove.
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>>;
}

export type IVCProofVerificationResult = {
  // The result of verification
  valid: boolean;
  // The duration of the verification in milliseconds
  durationMs: number;
  // The total duration, including proof serialisation and file-system cleanup
  totalDurationMs: number;
};

/**
 * A verifier used by nodes to check tx proofs are valid.
 */
export interface ClientProtocolCircuitVerifier {
  /**
   * Verifies the private protocol circuit's proof.
   * @param tx - The tx to verify the proof of
   * @returns True if the proof is valid, false otherwise
   */
  verifyProof(tx: Tx): Promise<IVCProofVerificationResult>;

  /**
   * Stop the verifier.
   */
  stop(): Promise<void>;
}
