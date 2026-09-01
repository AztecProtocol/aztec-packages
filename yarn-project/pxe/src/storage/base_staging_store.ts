import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore } from '@aztec/kv-store';

import type { Rollbackable } from './rollbackable.js';
import type { ChangeSetId, StagedStore } from './staged_write_coordinator.js';

/**
 * Base class for stores that stage their writes per change set, flushing them on commit and dropping them on abort.
 *
 * A change set's staged data exists only between {@link beginChangeSet} and {@link commitChangeSet}/
 * {@link discardChangeSet}. An operation arriving on behalf of a change set that already ended (e.g. one discarded on
 * abort) finds no matching change set and throws, so it cannot stage new data for a dead one.
 *
 * The staged data and the store's kv handles live in this base class and are only reachable through
 * {@link withChangeSet} (change set operations, with the DB read-only), {@link flushChangeSet} (the commit-time
 * write-back) and {@link applyRollback} (the reorg truncation).
 *
 * The class is thread safe: an internal lock serializes the operations run through {@link withChangeSet}, so two of
 * them issued concurrently (e.g. under `Promise.all`) never interleave across awaits. Subclasses can therefore read
 * staged data and write it back without handling atomicity themselves.
 *
 * @typeParam TChangeSet - The in-memory buffer a change set accumulates its writes in, built empty by `buildChangeSet`
 * on every {@link beginChangeSet} and dropped when the change set ends. A store keyed by id might stage
 * `{ items: Map<string, Item> }`.
 * @typeParam TDb - The store's kv handles, opened once at construction by `buildDb` and shared by every change set.
 * That same store would open `{ items: AztecAsyncMap<string, Buffer>; itemsByBlockNumber: AztecAsyncMultiMap }`.
 */
export abstract class BaseStagingStore<TChangeSet, TDb> implements StagedStore, Rollbackable {
  public readonly storeName: string;

  readonly #store: AztecAsyncKVStore;
  readonly #db: TDb;
  readonly #buildChangeSet: () => TChangeSet;
  readonly #lock = new Semaphore(1);

  /** The change set currently open, if any. */
  #current: OpenChangeSet<TChangeSet> | undefined;

  protected constructor({
    storeName,
    store,
    buildChangeSet,
    buildDb,
  }: {
    /** Unique name identifying this store, used in error messages and for registration with StagedWriteCoordinator. */
    storeName: string;
    /** The backing kv store; the runners open their transactions on it. */
    store: AztecAsyncKVStore;
    /** Creates the empty staged data a change set starts with. */
    buildChangeSet: () => TChangeSet;
    /** Opens the store's kv handles. */
    buildDb: (store: AztecAsyncKVStore) => TDb;
  }) {
    this.storeName = storeName;
    this.#store = store;
    this.#buildChangeSet = buildChangeSet;
    this.#db = buildDb(store);
  }

  /**
   * Opens the change set, so its operations are accepted until {@link commitChangeSet} or {@link discardChangeSet}.
   *
   * @throws If a change set is already open.
   */
  beginChangeSet(changeSetId: ChangeSetId): void {
    if (this.#current !== undefined) {
      throw new Error(
        `Store "${this.storeName}": cannot open change set "${changeSetId}" because change set ` +
          `"${this.#current.changeSetId}" is already open`,
      );
    }
    this.#current = { changeSetId, changeSet: this.#buildChangeSet(), inFlight: 0 };
  }

  /**
   * Commits the change set's staged data: flushes it via {@link flushChangeSet}, then closes the change set. Runs
   * inside the transaction owned by the caller.
   *
   * Not meant to be overridden: subclasses implement {@link flushChangeSet}.
   *
   * @throws If the change set is not open, or still has operations in flight.
   */
  async commitChangeSet(changeSetId: ChangeSetId): Promise<void> {
    const current = this.#currentOrThrow(changeSetId);
    if (current.inFlight > 0) {
      throw new Error(
        `Store "${this.storeName}": cannot commit change set "${changeSetId}" while ${current.inFlight} of its ` +
          `operations are in flight`,
      );
    }
    await this.flushChangeSet(current.changeSet, this.#db);
    this.#closeChangeSet(changeSetId);
  }

  /** Closes the change set, discarding any staged data without committing. A no-op if it is not open. */
  discardChangeSet(changeSetId: ChangeSetId): void {
    this.#closeChangeSet(changeSetId);
  }

  /**
   * Rolls the store back to `toBlock` via {@link applyRollback}.
   *
   * Must be called inside a transaction owned by the caller, since it opens none of its own.
   *
   * Not meant to be overridden: subclasses implement {@link applyRollback}.
   *
   * @throws If a change set is open, since its staged writes could later be committed anchored to deleted blocks.
   */
  async rollbackToBlock(toBlock: number): Promise<void> {
    if (this.#current !== undefined) {
      throw new Error(
        `Store "${this.storeName}": cannot roll back while change set "${this.#current.changeSetId}" is open`,
      );
    }
    await this.applyRollback(toBlock, this.#db);
  }

  /**
   * Writes the change set's staged data to persistent storage. Runs inside the caller's transaction: it must not
   * open a transaction of its own or call {@link withChangeSet}.
   */
  protected abstract flushChangeSet(changeSet: TChangeSet, db: TDb): Promise<void>;

  /**
   * Deletes the state originating from blocks strictly above `toBlock`. Runs inside the transaction owned by
   * {@link rollbackToBlock}'s caller: it must not open a transaction of its own or call {@link withChangeSet}.
   */
  protected abstract applyRollback(toBlock: number, db: TDb): Promise<void>;

  /**
   * Runs a change set operation (read or write). Takes the store's lock, opens a transaction, and calls `fn` with the
   * change set's staged data and a read-only view of the DB (writes are staged in memory until {@link flushChangeSet}
   * runs on commit).
   *
   * The lock makes the store thread safe: two operations issued concurrently (e.g. under `Promise.all`) cannot
   * interleave across awaits, so `fn` can read staged data and write it back without handling atomicity itself.
   *
   * @throws If the change set is not open.
   */
  protected async withChangeSet<R>(
    changeSetId: ChangeSetId,
    fn: (changeSet: TChangeSet, db: ReadonlyDb<TDb>) => Promise<R>,
  ): Promise<R> {
    const entered = this.#currentOrThrow(changeSetId);
    entered.inFlight++;
    try {
      await this.#lock.acquire();
      try {
        return await this.#store.transactionAsync(() => {
          // Re-resolve after the wait: the change set may have been discarded while this operation queued on the lock.
          const current = this.#currentOrThrow(changeSetId);
          return fn(current.changeSet, this.#db);
        });
      } finally {
        this.#lock.release();
      }
    } finally {
      // Count down on the change set this operation entered, which may no longer be the open one.
      entered.inFlight--;
    }
  }

  #currentOrThrow(changeSetId: ChangeSetId): OpenChangeSet<TChangeSet> {
    if (this.#current?.changeSetId !== changeSetId) {
      throw new Error(`Store "${this.storeName}": change set "${changeSetId}" is not open`);
    }
    return this.#current;
  }

  #closeChangeSet(changeSetId: ChangeSetId): void {
    if (this.#current?.changeSetId === changeSetId) {
      this.#current = undefined;
    }
  }
}

/**
 * View of a store's kv handles restricted to the kv interfaces' read methods. Change set operations receive this view:
 * while a change set is open the DB is read-only, since all writes are staged in memory until
 * {@link BaseStagingStore.flushChangeSet} runs on commit.
 */
export type ReadonlyDb<T> = {
  readonly [K in keyof T]: Pick<T[K], Extract<keyof T[K], ReadMethod>>;
};

/** The kv read surface staging stores use: what {@link ReadonlyDb} exposes while a change set is open. */
type ReadMethod =
  | 'getAsync'
  | 'hasAsync'
  | 'entriesAsync'
  | 'valuesAsync'
  | 'keysAsync'
  | 'sizeAsync'
  | 'getValuesAsync'
  | 'getValueCountAsync';

/**
 * The change set in progress: its id, its staged data (created empty when it opens), and how many of its operations
 * are still running.
 */
type OpenChangeSet<T> = { changeSetId: ChangeSetId; changeSet: T; inFlight: number };
