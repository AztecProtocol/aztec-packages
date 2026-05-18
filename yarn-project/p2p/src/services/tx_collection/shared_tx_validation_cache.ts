import type { Logger } from '@aztec/foundation/log';
import type { Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';

/** Outcome of a single validation submission. */
export type TxValidationOutcome =
  | { status: 'accepted' }
  | { status: 'invalid'; reason: string[] }
  | { status: 'skipped' };

/**
 * Public API for the tx validation cache shared across tx_collection sources.
 * See {@link SharedTxValidationCache} for the concrete implementation and policy.
 */
export interface ISharedTxValidationCache {
  /** Submit a tx for validation. Resolves with the outcome. */
  submit(tx: Tx): Promise<TxValidationOutcome>;
  /** Submit a batch of txs and wait for all outcomes. */
  submitBatch(txs: Tx[]): Promise<TxValidationOutcome[]>;
}

type PendingEntry = {
  tx: Tx;
  resolve: (outcome: TxValidationOutcome) => void;
};

/**
 * Caches tx validation across all tx_collection sources. Concurrent submissions for the
 * same tx hash are serialized through a per-hash drain loop; submissions for different
 * hashes proceed in parallel.
 *
 * Caching policy:
 * - Valid outcomes are remembered for the lifetime of the cache. Subsequent submissions
 *   for an already-validated hash return `skipped` without re-running the validator.
 * - Invalid outcomes are NEVER cached. A tx's claimed `txHash` is only trustworthy after
 *   validation (only `DataTxValidator` enforces `claim == content`); caching invalid would
 *   let a peer DoS legitimate copies of a hash by pre-submitting a forgery.
 * - First-invalid does not poison the per-hash queue: the next entry is validated normally
 *   and may pass, in which case the remaining entries are drained as `skipped`.
 */
export class SharedTxValidationCache implements ISharedTxValidationCache {
  /**
   * Hashes that have validated successfully at least once. Membership here is the cache:
   * any future `submit` for one of these hashes short-circuits to `skipped` without invoking
   * the validator. Entries are never removed — see the class-level caching policy for why
   * invalid outcomes are not tracked here.
   */
  private readonly validatedHashes = new Set<string>();
  /**
   * Per-hash FIFO of submissions awaiting validation. Presence of a key here means a
   * `processHash` drain loop is currently running for that hash; absence means no loop is
   * running (and `submit` is responsible for starting one). Entries are appended by `submit`
   * and consumed by `processHash`; the key is deleted in `processHash`'s `finally` once the
   * queue drains, which is what hands the "start a new loop" responsibility back to `submit`.
   */
  private readonly pendingByHash = new Map<string, PendingEntry[]>();

  constructor(
    private readonly validator: TxValidator<Tx>,
    private readonly logger: Logger,
  ) {}

  /** Submit a tx for validation. */
  public submit(tx: Tx): Promise<TxValidationOutcome> {
    const hash = tx.txHash.toString();

    if (this.validatedHashes.has(hash)) {
      this.logger.debug(`Skipping validation for tx ${hash} because it has already been validated.`);
      return Promise.resolve({ status: 'skipped' });
    }

    let resolve!: (outcome: TxValidationOutcome) => void;
    const promise = new Promise<TxValidationOutcome>(r => {
      resolve = r;
    });
    const entry: PendingEntry = { tx, resolve };

    const queue = this.pendingByHash.get(hash);
    if (queue) {
      queue.push(entry);
    } else {
      this.pendingByHash.set(hash, [entry]);
      void this.processHash(hash).catch(err => {
        this.logger.error(`Validation drain loop for tx ${hash} crashed`, err);
      });
    }

    return promise;
  }

  /** Submit a batch of txs and wait for all outcomes. */
  public submitBatch(txs: Tx[]): Promise<TxValidationOutcome[]> {
    return Promise.all(txs.map(tx => this.submit(tx)));
  }

  /**
   * Drain loop for a single hash. Runs as a detached promise (one per hash) started by
   * `submit` when it inserts the first entry for that hash; subsequent `submit` calls just
   * append to the queue and let this loop pick them up.
   *
   * Each iteration: pop the next entry, short-circuit to `skipped` if the hash has been
   * validated in the meantime, otherwise run the validator. A `valid` result is the
   * terminating case — it marks the hash validated, resolves any still-queued entries as
   * `skipped`, and exits. An `invalid` result resolves only that one entry and the loop
   * continues so that a later, correct submission of the same hash can still win.
   *
   * The `finally` deletes the queue key, which is the signal `submit` uses to decide whether
   * a new drain needs to be started for future submissions.
   */
  private async processHash(hash: string): Promise<void> {
    try {
      while (true) {
        const queue = this.pendingByHash.get(hash);
        if (!queue || queue.length === 0) {
          return;
        }

        const entry = queue.shift()!;

        if (this.validatedHashes.has(hash)) {
          entry.resolve({ status: 'skipped' });
          continue;
        }

        let result: TxValidationResult;
        try {
          result = await this.validator.validateTx(entry.tx);
        } catch (err) {
          this.logger.warn(`Validator threw for tx ${hash}`, { err });
          result = { result: 'invalid', reason: [err instanceof Error ? err.message : String(err)] };
        }

        if (result.result === 'valid') {
          this.validatedHashes.add(hash);
          entry.resolve({ status: 'accepted' });
          // Any txs still queued for this hash are either (1) correct and identical to the canonical
          // valid copy or (2) forgeries; either way we don't need to re-validate them.
          // NOTE: Fields not included in the hash could be different.
          // NOTE: This skips penalizing the peer for the forged TX if that is the case. This is the
          // downside of doing caching this way.
          for (const remaining of queue) {
            remaining.resolve({ status: 'skipped' });
          }
          queue.length = 0;
          return;
        }

        entry.resolve({ status: 'invalid', reason: result.reason });
      }
    } finally {
      this.pendingByHash.delete(hash);
    }
  }
}
