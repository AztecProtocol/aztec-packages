import type { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { PublicInputsAndRecursiveProof, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import type { PublicChonkVerifierPrivateInputs, PublicChonkVerifierPublicInputs } from '@aztec/stdlib/rollup';

/**
 * Result of a chonk-verifier proof, cached per tx hash on `EpochProvingContext`.
 */
export type ChonkVerifierProofResult = PublicInputsAndRecursiveProof<
  PublicChonkVerifierPublicInputs,
  typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
>;

/**
 * Per-epoch state shared across every `CheckpointSubTreeOrchestrator` constructed for
 * the same epoch. Owns the chonk-verifier proof cache so a tx whose checkpoint is
 * reorged out and re-appears in a replacement checkpoint does not have to re-prove
 * its chonk circuit.
 *
 * The context's chonk-verifier broker jobs are deliberately submitted **outside** the
 * sub-tree's deferred-proving queue. The sub-tree's `cancel()` therefore does not abort
 * them — by design, because their result is tx-scoped, not sub-tree-scoped, and a
 * replacement sub-tree should be able to consume the cached proof.
 *
 * Callers (`EpochProvingJob`, or unit tests) construct one context per epoch and pass
 * it into every sub-tree they create. `stop()` aborts every in-flight chonk job.
 */
export class EpochProvingContext {
  private readonly cache = new Map<string, Promise<ChonkVerifierProofResult>>();
  /** Abort controllers for in-flight chonk jobs, keyed by tx hash. */
  private readonly pending = new Map<string, AbortController>();
  private readonly log: Logger;
  private stopped = false;

  constructor(
    private readonly prover: ServerCircuitProver,
    public readonly epochNumber: EpochNumber,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('prover-client:epoch-proving-context', bindings);
  }

  /**
   * Returns the cached chonk-verifier proof promise for the given tx hash, or
   * `undefined` if none has been enqueued yet. Non-mutating.
   */
  public getCached(txHash: string): Promise<ChonkVerifierProofResult> | undefined {
    return this.cache.get(txHash);
  }

  /**
   * Enqueues a chonk-verifier proof for the given tx hash, returning the promise (or
   * the already-cached one if already enqueued). The promise resolves when the broker
   * delivers the result; on rejection (including `stop()`), the cache entry is removed
   * so a subsequent caller can re-enqueue.
   */
  public enqueue(txHash: string, inputs: PublicChonkVerifierPrivateInputs): Promise<ChonkVerifierProofResult> {
    if (this.stopped) {
      return Promise.reject(new Error('EpochProvingContext is stopped'));
    }

    const cached = this.cache.get(txHash);
    if (cached) {
      return cached;
    }

    const controller = new AbortController();
    this.pending.set(txHash, controller);
    this.log.debug(`Enqueueing chonk-verifier circuit`, { txHash, epochNumber: this.epochNumber });

    const promise = this.prover
      .getPublicChonkVerifierProof(inputs, controller.signal, this.epochNumber)
      .finally(() => this.pending.delete(txHash));

    // Self-clean on rejection so a future caller can re-enqueue. Mark the rejection
    // path as observed to silence unhandled-rejection warnings when no consumer
    // awaits the promise (e.g. when the only `.then` chain belonged to a cancelled
    // sub-tree's tx-proving state).
    promise.catch(err => {
      this.cache.delete(txHash);
      this.log.debug(`Chonk-verifier proof failed; evicted from cache`, { txHash, error: `${err}` });
    });

    this.cache.set(txHash, promise);
    return promise;
  }

  /**
   * Aborts every in-flight chonk-verifier broker job and clears the cache. Called by
   * the owning `EpochProvingJob` when the job stops.
   */
  public stop() {
    this.stopped = true;
    for (const controller of this.pending.values()) {
      controller.abort();
    }
    this.pending.clear();
    this.cache.clear();
  }
}
