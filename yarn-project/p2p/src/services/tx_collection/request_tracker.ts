import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import type { DateProvider } from '@aztec/foundation/timer';
import { TxHash } from '@aztec/stdlib/tx';
import type { Tx } from '@aztec/stdlib/tx';

/**
 * Tracks which transactions are still missing and need to be fetched.
 * Manages the request deadline and serves as the sole source of cancellation signal.
 * The request is cancelled when all txs are fetched or the deadline expires.
 */
export interface IRequestTracker {
  /** Returns the set of transaction hashes that are still missing. */
  get missingTxHashes(): Set<string>;
  /** Size of this.missingTxHashes */
  get numberOfMissingTxs(): number;
  /** Are all requested txs fetched */
  allFetched(): boolean;
  /** Checks that transaction is still missing */
  isMissing(txHash: string): boolean;
  /** Marks a transaction as fetched. Returns true if it was previously missing. */
  markFetched(tx: Tx): boolean;
  /** Get list of collected txs */
  get collectedTxs(): Tx[];
  /** The deadline for this request. */
  get deadline(): Date;
  /** Remaining time in milliseconds until deadline. Returns 0 if already past. */
  get timeoutMs(): number;
  /** Checks whether the request is cancelled (deadline expired or all fetched). May trigger cancellation if deadline has passed. */
  checkCancelled(): boolean;
  /** Resolves when deadline expires or all txs are fetched. */
  get cancellationToken(): Promise<void>;
  /** Externally cancel the request. */
  cancel(): void;
}

export class RequestTracker implements IRequestTracker {
  public readonly collectedTxs: Tx[] = [];
  private done = false;
  private readonly cancellationTokenPromise: PromiseWithResolvers<void>;
  private readonly deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    public readonly missingTxHashes: Set<string>,
    public readonly deadline: Date,
    private readonly dateProvider?: DateProvider,
  ) {
    this.cancellationTokenPromise = promiseWithResolvers<void>();

    if (missingTxHashes.size === 0) {
      this.finish();
      return;
    }

    const now = this.dateProvider?.now() ?? Date.now();
    const remaining = deadline.getTime() - now;
    if (remaining <= 0) {
      this.finish();
    } else {
      this.deadlineTimer = setTimeout(() => this.finish(), remaining);
    }
  }

  public static create(hashes: TxHash[] | string[], deadline: Date, dateProvider?: DateProvider) {
    return new RequestTracker(new Set(hashes.map(hash => hash.toString())), deadline, dateProvider);
  }

  markFetched(tx: Tx): boolean {
    if (this.missingTxHashes.delete(tx.txHash.toString())) {
      this.collectedTxs.push(tx);
      if (this.allFetched()) {
        this.finish();
      }
      return true;
    }
    return false;
  }

  get numberOfMissingTxs(): number {
    return this.missingTxHashes.size;
  }

  allFetched(): boolean {
    return this.numberOfMissingTxs === 0;
  }

  isMissing(txHash: string): boolean {
    return this.missingTxHashes.has(txHash.toString());
  }

  get timeoutMs(): number {
    const now = this.dateProvider?.now() ?? Date.now();
    return Math.max(0, this.deadline.getTime() - now);
  }

  checkCancelled(): boolean {
    if (this.done) {
      return true;
    }
    // Synchronous fallback: check deadline even if setTimeout hasn't fired yet.
    // This prevents macrotask starvation in tight async loops from blocking cancellation.
    const now = this.dateProvider?.now() ?? Date.now();
    if (now >= this.deadline.getTime()) {
      this.finish();
      return true;
    }
    return false;
  }

  get cancellationToken(): Promise<void> {
    return this.cancellationTokenPromise.promise;
  }

  cancel(): void {
    this.finish();
  }

  private finish() {
    if (this.done) {
      return;
    }
    this.done = true;
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
    }
    this.cancellationTokenPromise.resolve();
  }
}
