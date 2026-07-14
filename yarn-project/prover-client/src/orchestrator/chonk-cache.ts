import type { NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH } from '@aztec/constants';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { L2Block } from '@aztec/stdlib/block';
import type { PublicInputsAndRecursiveProof } from '@aztec/stdlib/interfaces/server';
import type { PublicChonkVerifierPublicInputs } from '@aztec/stdlib/rollup';

/** Result of a chonk-verifier proof, cached by tx hash. */
export type ChonkVerifierProofResult = PublicInputsAndRecursiveProof<
  PublicChonkVerifierPublicInputs,
  typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
>;

/**
 * Shared cache of `getPublicChonkVerifierProof` results, keyed by tx hash.
 *
 * Owned by the prover-node and shared across every epoch / session: a tx remined into
 * a different block (e.g. after a brief L1 reorg) reuses the already-computed chonk
 * proof rather than redoing it. Entries are released via `releaseForBlocks` once the
 * containing block is no longer interesting to the caller (e.g. its epoch's proof
 * submission window has expired).
 */
export class ChonkCache {
  private readonly cache = new Map<string, Promise<ChonkVerifierProofResult>>();
  private readonly pending = new Map<string, AbortController>();
  private readonly log: Logger;
  private stopped = false;

  constructor(bindings?: LoggerBindings) {
    this.log = createLogger('prover-client:chonk-cache', bindings);
  }

  /** Returns the cached promise for `txHash`, or `undefined` if none is registered. */
  public get(txHash: string): Promise<ChonkVerifierProofResult> | undefined {
    return this.cache.get(txHash);
  }

  /**
   * Atomic get-or-compute: returns the cached promise for `txHash`, or runs `factory`
   * (passing an AbortSignal the cache controls) and caches its result. Concurrent
   * callers for the same `txHash` share the same promise.
   *
   * Rejected promises are evicted so a future caller can retry. The factory's
   * AbortSignal fires when the cache is stopped.
   */
  public getOrCompute(
    txHash: string,
    factory: (signal: AbortSignal) => Promise<ChonkVerifierProofResult>,
  ): Promise<ChonkVerifierProofResult> {
    if (this.stopped) {
      return Promise.reject(new Error('ChonkCache is stopped'));
    }
    const existing = this.cache.get(txHash);
    if (existing) {
      return existing;
    }
    const controller = new AbortController();
    this.pending.set(txHash, controller);
    this.log.debug(`Enqueueing chonk-verifier circuit`, { txHash });
    const promise = factory(controller.signal).finally(() => this.pending.delete(txHash));
    // Silently observe the rejection branch and evict so a retry is possible.
    promise.catch(err => {
      this.cache.delete(txHash);
      this.log.debug(`Chonk-verifier proof failed; evicted from cache`, { txHash, error: `${err}` });
    });
    this.cache.set(txHash, promise);
    return promise;
  }

  /** Drops cache entries for every tx in the supplied blocks. */
  public releaseForBlocks(blocks: L2Block[]): void {
    let released = 0;
    for (const block of blocks) {
      for (const txEffect of block.body.txEffects) {
        if (this.cache.delete(txEffect.txHash.toString())) {
          released++;
        }
      }
    }
    if (released > 0) {
      this.log.debug(`Released ${released} chonk-verifier cache entries`, {
        blockCount: blocks.length,
        releasedCount: released,
      });
    }
  }

  /** Aborts every in-flight chonk-verifier job and clears the cache. */
  public stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const controller of this.pending.values()) {
      controller.abort();
    }
    this.pending.clear();
    this.cache.clear();
  }
}
