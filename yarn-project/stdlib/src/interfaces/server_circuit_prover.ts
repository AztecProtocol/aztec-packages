import type {
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';

import type { AvmProvingInputs, AvmProvingResult } from '../block_execution/avm_proving_job.js';
import type { BlockExecutionInputs } from '../block_execution/block_execution_inputs.js';
import type { BlockExecutionResult } from '../block_execution/block_execution_result.js';
import type { ParityBasePrivateInputs } from '../parity/parity_base_private_inputs.js';
import type { ParityPublicInputs } from '../parity/parity_public_inputs.js';
import type { ParityRootPrivateInputs } from '../parity/parity_root_private_inputs.js';
import type { BlockMergeRollupPrivateInputs } from '../rollup/block_merge_rollup_private_inputs.js';
import type { BlockRollupPublicInputs } from '../rollup/block_rollup_public_inputs.js';
import type {
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
} from '../rollup/block_root_rollup_private_inputs.js';
import type { CheckpointMergeRollupPrivateInputs } from '../rollup/checkpoint_merge_rollup_private_inputs.js';
import type { CheckpointRollupPublicInputs } from '../rollup/checkpoint_rollup_public_inputs.js';
import type {
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
} from '../rollup/checkpoint_root_rollup_private_inputs.js';
import type { PrivateTxBaseRollupPrivateInputs } from '../rollup/private_tx_base_rollup_private_inputs.js';
import type { PublicChonkVerifierPrivateInputs } from '../rollup/public_chonk_verifier_private_inputs.js';
import type { PublicChonkVerifierPublicInputs } from '../rollup/public_chonk_verifier_public_inputs.js';
import type { PublicTxBaseRollupPrivateInputs } from '../rollup/public_tx_base_rollup_private_inputs.js';
import type { RootRollupPrivateInputs } from '../rollup/root_rollup_private_inputs.js';
import type { RootRollupPublicInputs } from '../rollup/root_rollup_public_inputs.js';
import type { TxMergeRollupPrivateInputs } from '../rollup/tx_merge_rollup_private_inputs.js';
import type { TxRollupPublicInputs } from '../rollup/tx_rollup_public_inputs.js';
import type { Tx } from '../tx/tx.js';
import type { PublicInputsAndRecursiveProof } from './proving-job.js';

/**
 * Generates proofs for parity and rollup circuits.
 */
export interface ServerCircuitProver {
  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBaseParityProof(
    inputs: ParityBasePrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootParityProof(
    inputs: ParityRootPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>>;

  getPublicChonkVerifierProof(
    inputs: PublicChonkVerifierPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<PublicChonkVerifierPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getPrivateTxBaseRollupProof(
    baseRollupInput: PrivateTxBaseRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getPublicTxBaseRollupProof(
    inputs: PublicTxBaseRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getTxMergeRollupProof(
    input: TxMergeRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<TxRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockRootFirstRollupProof(
    input: BlockRootFirstRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getBlockRootSingleTxFirstRollupProof(
    input: BlockRootSingleTxFirstRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getBlockRootEmptyTxFirstRollupProof(
    input: BlockRootEmptyTxFirstRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getBlockRootRollupProof(
    input: BlockRootRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getBlockRootSingleTxRollupProof(
    input: BlockRootSingleTxRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockMergeRollupProof(
    input: BlockMergeRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>>;

  getCheckpointRootRollupProof(
    input: CheckpointRootRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  getCheckpointRootSingleBlockRollupProof(
    input: CheckpointRootSingleBlockRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  getCheckpointPaddingRollupProof(
    input: CheckpointPaddingRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  getCheckpointMergeRollupProof(
    input: CheckpointMergeRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<CheckpointRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  >;

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootRollupProof(
    input: RootRollupPrivateInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>>;

  /**
   * Create a proof for the AVM circuit.
   * @param inputs - Wrapped AVM circuit inputs (carries optional execution-agent passenger data).
   * @returns The AVM proof, plus the passenger data (passed through unchanged from inputs).
   */
  getAvmProof(inputs: AvmProvingInputs, signal?: AbortSignal, epochNumber?: number): Promise<AvmProvingResult>;

  /**
   * Re-execute every transaction in an L2 block on a forked world state and enqueue
   * the per-tx proving jobs (AVM, etc.) under deterministic IDs. The returned promise
   * resolves once execution is complete and the dependent jobs are visible to the
   * broker. Their proofs are picked up separately via the deterministic-ID monitor on
   * the orchestrator side.
   */
  executeBlock(inputs: BlockExecutionInputs, signal?: AbortSignal, epochNumber?: number): Promise<BlockExecutionResult>;
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
