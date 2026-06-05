import type { NESTED_RECURSIVE_PROOF_LENGTH, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import type { LoggerBindings } from '@aztec/foundation/log';
import type { TreeNodeLocation } from '@aztec/foundation/trees';
import type { PublicInputsAndRecursiveProof, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import type {
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  RootRollupPrivateInputs,
  RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';

import { ProvingScheduler, type ProvingStateLike } from './proving-scheduler.js';

type CheckpointRollupProof = PublicInputsAndRecursiveProof<
  CheckpointRollupPublicInputs,
  typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
>;

type RootRollupProof = PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>;

/**
 * State interface required by the top-tree proving drivers (checkpoint-merge → padding →
 * root-rollup). Both `EpochProvingState` and `TopTreeProvingState` satisfy it structurally;
 * the per-checkpoint state in `EpochProvingState` (block/tx proving, world-state forks)
 * is owned outside this surface.
 */
export interface TopTreeStateLike extends ProvingStateLike {
  readonly epochNumber: EpochNumber;
  readonly totalNumCheckpoints: number;

  tryStartProvingCheckpointMerge(location: TreeNodeLocation): boolean;
  setCheckpointMergeRollupProof(location: TreeNodeLocation, provingOutput: CheckpointRollupProof): void;
  isReadyForCheckpointMerge(location: TreeNodeLocation): boolean;
  getParentLocation(location: TreeNodeLocation): TreeNodeLocation;
  getCheckpointMergeRollupInputs(location: TreeNodeLocation): CheckpointMergeRollupPrivateInputs;

  tryStartProvingPaddingCheckpoint(): boolean;
  setCheckpointPaddingProof(provingOutput: CheckpointRollupProof): void;
  getPaddingCheckpointInputs(): CheckpointPaddingRollupPrivateInputs;

  tryStartProvingRootRollup(): boolean;
  setRootRollupProof(provingOutput: RootRollupProof): void;
  isReadyForRootRollup(): boolean;
  getRootRollupInputs(): RootRollupPrivateInputs;
}

/**
 * Shared scheduling for the top-tree section of epoch proving — checkpoint-merge,
 * padding (single-checkpoint case), and root rollup. Both `ProvingOrchestrator` and
 * `TopTreeOrchestrator` extend this; their per-checkpoint-root drivers diverge (one
 * drains state-derived inputs once block-merge is done, the other builds inputs from
 * caller-supplied checkpoint data), but the rest of the tree is identical.
 *
 * Subclasses provide a `wrapCircuitCall` hook for telemetry (the orchestrator wraps
 * each call in a span; the top-tree leaves it as identity), and an
 * `onRootRollupComplete` hook to invoke the right shape of `state.resolve()` —
 * `EpochProvingState.resolve` takes a `ProvingResult`, `TopTreeProvingState.resolve`
 * is no-arg.
 */
export abstract class TopTreeProvingScheduler extends ProvingScheduler {
  constructor(
    protected readonly prover: ServerCircuitProver,
    enqueueConcurrency: number,
    loggerName?: string,
    bindings?: LoggerBindings,
  ) {
    super(enqueueConcurrency, loggerName, bindings);
  }

  /**
   * Wraps a circuit call for telemetry. Default is identity; the orchestrator overrides
   * to wrap with `wrapCallbackInSpan`.
   */
  protected wrapCircuitCall<T>(
    _circuitName: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): (signal: AbortSignal) => Promise<T> {
    return fn;
  }

  /** Called once the root rollup proof has been set; subclasses call `state.resolve(...)` with the right shape. */
  protected abstract onRootRollupComplete(state: TopTreeStateLike): void;

  protected enqueueCheckpointMergeRollup(state: TopTreeStateLike, location: TreeNodeLocation) {
    if (!state.verifyState() || !state.tryStartProvingCheckpointMerge(location)) {
      return;
    }
    const inputs = state.getCheckpointMergeRollupInputs(location);
    this.deferredProving(
      state,
      this.wrapCircuitCall('rollup-checkpoint-merge', signal =>
        this.prover.getCheckpointMergeRollupProof(inputs, signal, state.epochNumber),
      ),
      result => {
        state.setCheckpointMergeRollupProof(location, result);
        this.checkAndEnqueueNextCheckpointMergeRollup(state, location);
      },
    );
  }

  protected enqueueEpochPadding(state: TopTreeStateLike) {
    if (!state.verifyState() || !state.tryStartProvingPaddingCheckpoint()) {
      return;
    }
    const inputs = state.getPaddingCheckpointInputs();
    this.deferredProving(
      state,
      this.wrapCircuitCall('rollup-checkpoint-padding', signal =>
        this.prover.getCheckpointPaddingRollupProof(inputs, signal, state.epochNumber),
      ),
      result => {
        state.setCheckpointPaddingProof(result);
        this.checkAndEnqueueRootRollup(state);
      },
    );
  }

  protected enqueueRootRollup(state: TopTreeStateLike) {
    if (!state.verifyState() || !state.tryStartProvingRootRollup()) {
      return;
    }
    const inputs = state.getRootRollupInputs();
    this.deferredProving(
      state,
      this.wrapCircuitCall('rollup-root', signal => this.prover.getRootRollupProof(inputs, signal, state.epochNumber)),
      result => {
        this.logger.verbose(`Completed root rollup for epoch ${state.epochNumber}`);
        state.setRootRollupProof(result);
        this.onRootRollupComplete(state);
      },
    );
  }

  protected checkAndEnqueueNextCheckpointMergeRollup(state: TopTreeStateLike, currentLocation: TreeNodeLocation) {
    if (!state.isReadyForCheckpointMerge(currentLocation)) {
      return;
    }
    const parentLocation = state.getParentLocation(currentLocation);
    if (parentLocation.level === 0) {
      this.checkAndEnqueueRootRollup(state);
    } else {
      this.enqueueCheckpointMergeRollup(state, parentLocation);
    }
  }

  protected checkAndEnqueueRootRollup(state: TopTreeStateLike) {
    if (!state.isReadyForRootRollup()) {
      return;
    }
    this.enqueueRootRollup(state);
  }
}
