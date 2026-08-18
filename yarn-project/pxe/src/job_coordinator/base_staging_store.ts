import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore } from '@aztec/kv-store';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- JobCoordinator is referenced only by {@link} doc tags
import type { JobCoordinator, JobId, StagedStore } from './job_coordinator.js';

/**
 * Base class for stores that stage their writes per job, flushing them on commit and dropping them on abort.
 *
 * A job's staged data exists only between {@link beginJob} and {@link commit}/{@link discardStaged}. An operation
 * arriving on behalf of a job that already ended (e.g. one discarded on abort) finds no matching job and throws, so
 * it cannot stage new data for a dead job.
 *
 * The staged data and the store's kv handles live in this base class and are only reachable through
 * {@link withStaging} (job operations, with the DB read-only), {@link joblessDb} (operations with no job context), and
 * {@link flushStaged} (the commit-time write-back).
 */
export abstract class BaseStagingStore<TStaging, TDb> implements StagedStore {
  public readonly storeName: string;

  readonly #store: AztecAsyncKVStore;
  readonly #db: TDb;
  readonly #buildStaging: () => TStaging;
  readonly #lock = new Semaphore(1);

  /** {@link JobCoordinator} runs one job at a time, so the store holds a single current-job slot. */
  #current: CurrentJob<TStaging> | undefined;

  protected constructor({
    storeName,
    store,
    buildStaging,
    buildDb,
  }: {
    /** Unique name identifying this store, used in error messages and for registration with JobCoordinator. */
    storeName: string;
    /** The backing kv store; the runners open their transactions on it. */
    store: AztecAsyncKVStore;
    /** Creates the empty staged data a job starts with. */
    buildStaging: () => TStaging;
    /** Opens the store's kv handles. */
    buildDb: (store: AztecAsyncKVStore) => TDb;
  }) {
    this.storeName = storeName;
    this.#store = store;
    this.#buildStaging = buildStaging;
    this.#db = buildDb(store);
  }

  /**
   * Makes the job current, so its operations are accepted until {@link commit} or {@link discardStaged}.
   *
   * @throws If a job is already in progress: beginning another would silently discard its staged data.
   */
  beginJob(jobId: JobId): void {
    this.assertNoJobInProgress();
    this.#current = { jobId, staging: this.#buildStaging() };
  }

  /**
   * Commits the job's staged data: flushes it via {@link flushStaged}, then ends the job. Runs inside
   * {@link JobCoordinator}'s commit transaction.
   *
   * Not meant to be overridden: subclasses implement {@link flushStaged}.
   *
   * @throws If the job is not in progress.
   */
  async commit(jobId: JobId): Promise<void> {
    const current = this.#currentOrThrow(jobId);
    await this.flushStaged(current.staging, this.#db);
    this.#endJob(jobId);
  }

  /**
   * Writes the job's staged data to persistent storage. Runs inside {@link JobCoordinator}'s commit transaction: it
   * must not open a transaction of its own or take the store's lock.
   */
  protected abstract flushStaged(staging: TStaging, db: TDb): Promise<void>;

  /** Ends the job, discarding any staged data without committing. A no-op if the job is not in progress. */
  discardStaged(jobId: JobId): Promise<void> {
    this.#endJob(jobId);
    return Promise.resolve();
  }

  /**
   * Runs a job operation (read or write). Takes the store's lock, opens a transaction, and calls `fn` with the job's
   * staged data and a read-only view of the DB (writes are staged in memory until {@link flushStaged} runs on commit).
   *
   * The lock serializes the job's operations: staged data lives in JS memory, outside the DB transaction's isolation,
   * so two operations interleaving across awaits could lose an update. Waiting for the lock inside a transaction would
   * deadlock, so calls to this method must not nest, and must not happen inside an outer transaction.
   *
   * @throws If the job is not in progress.
   */
  protected async withStaging<R>(jobId: JobId, fn: (staging: TStaging, db: ReadonlyDb<TDb>) => Promise<R>): Promise<R> {
    this.#currentOrThrow(jobId);
    await this.#lock.acquire();
    try {
      return await this.#store.transactionAsync(() => {
        // Re-resolve after the wait: the job may have ended while this operation queued on the lock.
        const current = this.#currentOrThrow(jobId);
        return fn(current.staging, this.#db);
      });
    } finally {
      this.#lock.release();
    }
  }

  /**
   * The store's writable kv handles, for operations with no job context. Unlike {@link withStaging} this takes no lock
   * and opens no transaction.
   */
  protected get joblessDb(): TDb {
    return this.#db;
  }

  /**
   * Throws if any job is in progress.
   */
  protected assertNoJobInProgress(): void {
    if (this.#current !== undefined) {
      throw new Error(`Store "${this.storeName}" has job "${this.#current.jobId}" in progress`);
    }
  }

  #currentOrThrow(jobId: JobId): CurrentJob<TStaging> {
    if (this.#current?.jobId !== jobId) {
      throw new Error(`Store "${this.storeName}": job "${jobId}" is not in progress`);
    }
    return this.#current;
  }

  #endJob(jobId: JobId): void {
    if (this.#current?.jobId === jobId) {
      this.#current = undefined;
    }
  }
}

/**
 * View of a store's kv handles restricted to the kv interfaces' read methods. Job operations receive this view: during
 * a job the DB is read-only, since all writes are staged in memory until {@link BaseStagingStore.flushStaged} runs on
 * commit.
 */
export type ReadonlyDb<T> = {
  readonly [K in keyof T]: Pick<T[K], Extract<keyof T[K], ReadMethod>>;
};

/** The read surface of the kv interfaces used by staging stores: what {@link ReadonlyDb} exposes during a job. */
type ReadMethod =
  | 'getAsync'
  | 'hasAsync'
  | 'entriesAsync'
  | 'valuesAsync'
  | 'keysAsync'
  | 'sizeAsync'
  | 'getValuesAsync'
  | 'getValueCountAsync';

/** The job in progress: its id and its staged data, created empty when the job begins. */
type CurrentJob<T> = { jobId: JobId; staging: T };
