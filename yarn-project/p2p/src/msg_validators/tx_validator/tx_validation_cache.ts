import { type Logger, createLogger } from '@aztec/foundation/log';
import type { TxHash, TxValidationResult } from '@aztec/stdlib/tx';

/**
 * Minimal interface consumed by {@link CachedTxValidator}.
 * Keeping the dependency on an interface lets callers (and tests) substitute any cache implementation.
 */
export interface ITxValidationCache {
  /** Returns the cached promise if present, otherwise calls `validate`, caches its promise, and returns it. */
  getOrValidate(
    validatorSymbol: symbol,
    txHash: TxHash,
    validate: () => Promise<TxValidationResult>,
  ): Promise<TxValidationResult>;
}

/** Node in the doubly-linked list used for LRU ordering. Head = least recent, tail = most recent. */
type LruNode = {
  key: string;
  prev: LruNode | undefined;
  next: LruNode | undefined;
};

/**
 * Caches per-validator tx validation results to avoid redundant work across repeated validation calls.
 *
 * The cache key is composed from the validator symbol and tx hash, ensuring results are
 * scoped to the specific validator that produced them.
 *
 * Promises are stored before they are awaited, so concurrent calls for the same pair share
 * a single in-flight validation rather than launching duplicate work.
 *
 * Entries are evicted in least-recently-used order once the cache reaches `maxSize`.
 */
export class TxValidationCache {
  #log: Logger;

  private readonly values = new Map<string, Promise<TxValidationResult>>();
  private readonly nodes = new Map<string, LruNode>();
  private head: LruNode | undefined;
  private tail: LruNode | undefined;

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) {
      throw new Error('TxValidationCache maxSize must be at least 1');
    }
    this.#log = createLogger('p2p:tx_validation_cache');
  }

  private key(validatorSymbol: symbol, txHash: TxHash): string {
    return `${Symbol.keyFor(validatorSymbol) ?? validatorSymbol.toString()}:${txHash.toString()}`;
  }

  /** Returns the cached promise for the given validator and tx, or undefined if not cached. Refreshes recency. */
  public get(validatorSymbol: symbol, txHash: TxHash): Promise<TxValidationResult> | undefined {
    const k = this.key(validatorSymbol, txHash);
    const node = this.nodes.get(k);
    if (!node) {
      return undefined;
    }
    this.moveToTail(node);
    return this.values.get(k);
  }

  /** Stores a validation promise for the given validator and tx, evicting the LRU entry if at capacity. */
  public set(validatorSymbol: symbol, txHash: TxHash, result: Promise<TxValidationResult>): void {
    const k = this.key(validatorSymbol, txHash);
    const existing = this.nodes.get(k);
    if (existing) {
      this.values.set(k, result);
      this.moveToTail(existing);
      return;
    }

    if (this.values.size >= this.maxSize) {
      this.evictHead();
    }

    const node: LruNode = { key: k, prev: this.tail, next: undefined };
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.nodes.set(k, node);
    this.values.set(k, result);
  }

  /** Removes a cached validation promise for the given validator and tx. */
  public delete(validatorSymbol: symbol, txHash: TxHash): void {
    const k = this.key(validatorSymbol, txHash);
    const node = this.nodes.get(k);
    if (!node) {
      return;
    }
    this.unlink(node);
    this.nodes.delete(k);
    this.values.delete(k);
  }

  /**
   * Returns the cached promise if present, otherwise calls `validate`, stores its promise
   * immediately (before awaiting), and returns it.
   */
  public async getOrValidate(
    validatorSymbol: symbol,
    txHash: TxHash,
    validate: () => Promise<TxValidationResult>,
  ): Promise<TxValidationResult> {
    const cached = this.get(validatorSymbol, txHash);
    if (cached !== undefined) {
      // If the promise is already resolved, log the result.
      const result: string = await Promise.race([cached.then(p => p.result), Promise.resolve('<in-flight>')]);
      this.#log.debug(
        `Returning cached result '${result}' for validator ${validatorSymbol.toString()} and tx ${txHash.toString()}`,
      );
      return cached;
    }
    const promise = validate().catch(err => {
      // Evict failed validations so the next call retries instead of reusing a rejected promise.
      this.delete(validatorSymbol, txHash);
      throw err;
    });
    this.set(validatorSymbol, txHash, promise);
    return promise;
  }

  private moveToTail(node: LruNode): void {
    if (node === this.tail) {
      return;
    }
    this.unlink(node);
    node.prev = this.tail;
    node.next = undefined;
    if (this.tail) {
      this.tail.next = node;
    }
    this.tail = node;
  }

  private unlink(node: LruNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = undefined;
    node.next = undefined;
  }

  private evictHead(): void {
    const oldHead = this.head;
    if (!oldHead) {
      return;
    }
    this.head = oldHead.next;
    if (this.head) {
      this.head.prev = undefined;
    } else {
      this.tail = undefined;
    }
    this.nodes.delete(oldHead.key);
    this.values.delete(oldHead.key);
  }
}
