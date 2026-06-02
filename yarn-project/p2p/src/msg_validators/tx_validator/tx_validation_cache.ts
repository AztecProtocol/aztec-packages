import { LruMap } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { Tx, TxValidationResult } from '@aztec/stdlib/tx';

import { webcrypto } from 'node:crypto';

/**
 * Minimal interface consumed by {@link CachedTxValidator}.
 * Keeping the dependency on an interface lets callers (and tests) substitute any cache implementation.
 */
export interface ITxValidationCache {
  /** Returns the cached promise if present, otherwise calls `validate`, caches its promise, and returns it. */
  getOrValidate(
    validatorSymbol: symbol,
    tx: Tx,
    validate: () => Promise<TxValidationResult>,
  ): Promise<TxValidationResult>;
}

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
export class TxValidationCache implements ITxValidationCache {
  #log: Logger;

  private readonly entries: LruMap<string, Promise<TxValidationResult>>;
  // Remember hashes for known Tx object references to skip rehashing on subsequent lookups.
  // WeakMap holds keys weakly, so an entry doesn't keep the Tx alive once nothing else references it.
  private readonly txHashesCache: WeakMap<Tx, string> = new WeakMap();

  constructor(maxSize: number) {
    this.entries = new LruMap(maxSize);
    this.#log = createLogger('p2p:tx_validation_cache');
  }

  /**
   * Computes the cache key scoping a validation result to a specific validator and tx.
   *
   * @param validatorSymbol - The symbol of the validator.
   * @param tx - The tx to compute the key for.
   * @returns The cache key.
   *
   * Note: the key should NOT use the tx.hash because it can't be trusted at this point.
   */
  public async key(validatorSymbol: symbol, tx: Tx): Promise<string> {
    // Hashing the whole tx takes a few milliseconds. So if we have already hashed
    // this particular object, we avoid rehashing it.
    let hash = this.txHashesCache.get(tx);
    if (hash === undefined) {
      hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', tx.toBuffer())).toString('hex');
      this.txHashesCache.set(tx, hash);
    }
    return `${Symbol.keyFor(validatorSymbol) ?? validatorSymbol.toString()}:${hash}`;
  }

  /** Returns the cached promise for the given key, or undefined if not cached. Refreshes recency. */
  public get(key: string): Promise<TxValidationResult> | undefined {
    return this.entries.get(key);
  }

  /** Stores a validation promise under the given key, evicting the LRU entry if at capacity. */
  public set(key: string, result: Promise<TxValidationResult>): void {
    this.entries.set(key, result);
  }

  /** Removes the cached validation promise for the given key. */
  public delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Returns the cached promise if present, otherwise calls `validate`, stores its promise
   * immediately (before awaiting), and returns it.
   */
  public async getOrValidate(
    validatorSymbol: symbol,
    tx: Tx,
    validate: () => Promise<TxValidationResult>,
  ): Promise<TxValidationResult> {
    const key = await this.key(validatorSymbol, tx);
    const cached = this.get(key);
    if (cached !== undefined) {
      this.#log.debug('Returning cached tx validation result', {
        validator: validatorSymbol.toString(),
        txHash: tx.txHash.toString(),
        key: key,
      });
      return cached;
    }
    const promise = validate();
    this.set(key, promise);
    return promise;
  }
}
