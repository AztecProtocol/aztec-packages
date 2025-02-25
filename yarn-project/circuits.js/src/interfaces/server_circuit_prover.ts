import { type AvmCircuitInputs } from '@aztec/circuits.js/avm';
import { type BaseParityInputs, type ParityPublicInputs, type RootParityInputs } from '@aztec/circuits.js/parity';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type MergeRollupInputs,
  type PrivateBaseRollupInputs,
  type PublicBaseRollupInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type SingleTxBlockRootRollupInputs,
  type TubeInputs,
} from '@aztec/circuits.js/rollup';
import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type RECURSIVE_PROOF_LENGTH,
  type TUBE_PROOF_LENGTH,
} from '@aztec/constants';

import type { Tx } from '../tx/tx.js';
import { type ProofAndVerificationKey, type PublicInputsAndRecursiveProof } from './proving-job.js';

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
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>>;
}

/**
 * A verifier used by nodes to check tx proofs are valid.
 */
export interface ClientProtocolCircuitVerifier {
  /**
   * Verifies the private protocol circuit's proof.
   * @param tx - The tx to verify the proof of
   * @returns True if the proof is valid, false otherwise
   */
  verifyProof(tx: Tx): Promise<boolean>;
}
