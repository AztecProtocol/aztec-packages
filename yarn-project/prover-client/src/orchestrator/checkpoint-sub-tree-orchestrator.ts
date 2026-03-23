import type { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import type { LoggerBindings } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { EthAddress } from '@aztec/stdlib/block';
import type {
  ForkMerkleTreeOperations,
  PublicInputsAndRecursiveProof,
  ReadonlyWorldStateAccess,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import type { BlockRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { getTelemetryClient } from '@aztec/telemetry-client';

import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import { ProvingOrchestrator } from './orchestrator.js';

/**
 * Result of proving a checkpoint's sub-tree (block-level proving only).
 * Contains the final BlockRollupPublicInputs that the top-tree uses for checkpoint root rollups.
 */
export type SubTreeResult = {
  /** Block proof outputs (1 for single-block, 2 for multi-block checkpoint). */
  blockProofOutputs: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >[];
};

/**
 * Orchestrates proving for a single checkpoint's block sub-tree.
 *
 * Extends ProvingOrchestrator and overrides the checkpoint-root boundary:
 * instead of proceeding to checkpoint root rollup, it extracts the final
 * BlockRollupPublicInputs and resolves a promise with them.
 *
 * The sub-tree needs NO epoch-level context (no blob challenges, no knowledge
 * of other checkpoints). It only processes one checkpoint's blocks.
 */
export class CheckpointSubTreeOrchestrator extends ProvingOrchestrator {
  private subTreeResolve?: (result: SubTreeResult) => void;
  private subTreeReject?: (err: Error) => void;

  constructor(
    dbProvider: ReadonlyWorldStateAccess & ForkMerkleTreeOperations,
    prover: ServerCircuitProver,
    proverId: EthAddress,
    enqueueConcurrency: number,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    super(dbProvider, prover, proverId, false, enqueueConcurrency, telemetryClient, bindings);
  }

  /**
   * Override the checkpoint root rollup boundary.
   * Extract the final block proofs and resolve instead of proceeding to checkpoint root.
   */
  // eslint-disable-next-line require-await
  protected override async checkAndEnqueueCheckpointRootRollup(provingState: CheckpointProvingState): Promise<void> {
    // We don't check isReadyForCheckpointRoot() because that requires blob/out-hash state.
    // Instead, check if the block proofs themselves are ready.
    const proofs = provingState.getSubTreeOutputProofs();
    const nonEmptyProofs = proofs.filter((p): p is NonNullable<typeof p> => !!p);

    if (proofs.length !== nonEmptyProofs.length) {
      // Not all block proofs ready yet — will be called again when more complete
      return;
    }

    this.subTreeResolve?.({ blockProofOutputs: nonEmptyProofs });
  }

  /** Returns a promise that resolves when the sub-tree proving completes. */
  getSubTreeResult(): Promise<SubTreeResult> {
    const { promise, resolve, reject } = promiseWithResolvers<SubTreeResult>();
    this.subTreeResolve = resolve;
    this.subTreeReject = reject;
    return promise;
  }
}
