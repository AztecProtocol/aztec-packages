import { randomBytes } from '@aztec/foundation/crypto/random';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';

import { JobContext } from './job_context.js';

/**
 * Interface that data providers must implement to support staged writes.
 */
export interface StagedStore {
  /** Unique name identifying this provider (used for tracking affected stores) */
  readonly storeName: string;

  /**
   * Commits staged data to main storage.
   * Should be called within a transaction for atomicity.
   *
   * @param context - The job context containing the staging prefix
   */
  commit(context: JobContext): Promise<void>;

  /**
   * Discards staged data without committing.
   * Called on abort or during recovery.
   *
   * @param context - The job context containing the staging prefix
   */
  discardStaged(context: JobContext): Promise<void>;
}

/**
 * JobCoordinator manages job lifecycle and provides crash resilience for PXE operations.
 *
 * It uses a staged writes pattern:
 * 1. When a job begins, a context is created with a unique staging prefix
 * 2. During the job, all writes go to staging (prefixed keys)
 * 3. On commit, staging is promoted to main storage
 * 4. On abort, staged data is discarded
 *
 * Note: PXE should only rely on a single JobCoordinator instance, so it can eventually
 * orchestrate concurrent jobs. Right now it doesn't make a difference because we're
 * using a job queue with concurrency=1.
 */
export class JobCoordinator {
  private readonly log = createLogger('pxe:job_coordinator');

  /** The underlying KV store */
  kvStore: AztecAsyncKVStore;

  /** Current job context (in-memory only) */
  #currentJob: JobContext | undefined;

  /** All registered staged stores */
  #stores: Map<string, StagedStore> = new Map();

  constructor(kvStore: AztecAsyncKVStore) {
    this.kvStore = kvStore;
  }

  /**
   * Registers a staged store.
   * Must be called during initialization for all stores that need staging support.
   */
  registerStore(store: StagedStore): void {
    if (this.#stores.has(store.storeName)) {
      throw new Error(`Store "${store.storeName}" is already registered`);
    }
    this.#stores.set(store.storeName, store);
    this.log.debug(`Registered staged store: ${store.storeName}`);
  }

  /**
   * Registers multiple staged stores.
   */
  registerStores(stores: StagedStore[]): void {
    for (const store of stores) {
      this.registerStore(store);
    }
  }

  /**
   * Begins a new job and returns a context for staged writes.
   *
   * @returns JobContext to pass to store operations
   */
  beginJob(): JobContext {
    if (this.#currentJob) {
      throw new Error(
        `Cannot begin job: job ${this.#currentJob.jobId} is already in progress. ` +
          `This should not happen - ensure jobs are properly committed or aborted.`,
      );
    }

    const jobId = randomBytes(8).toString('hex');
    const context = new JobContext(jobId);
    this.#currentJob = context;

    this.log.debug(`Started job ${jobId}`);
    return context;
  }

  /**
   * Commits a job by promoting all staged data to main storage.
   *
   * @param context - The job context returned from beginJob
   */
  async commitJob(context: JobContext): Promise<void> {
    if (!this.#currentJob || this.#currentJob.jobId !== context.jobId) {
      throw new Error(
        `Cannot commit job ${context.jobId}: no matching job in progress. ` +
          `Current job: ${this.#currentJob ? this.#currentJob.jobId : 'none'}`,
      );
    }

    this.log.debug(`Committing job ${context.jobId}`);

    // Commit all stores atomically in a single transaction.
    // Each store's commit is a no-op if it has no staged data (but that's up to each store to handle).
    await this.kvStore.transactionAsync(async () => {
      for (const store of this.#stores.values()) {
        await store.commit(context);
      }
    });

    this.#currentJob = undefined;
    this.log.debug(`Job ${context.jobId} committed successfully`);
  }

  /**
   * Aborts a job by discarding all staged data.
   *
   * @param context - The job context returned from beginJob
   */
  async abortJob(context: JobContext): Promise<void> {
    if (!this.#currentJob || this.#currentJob.jobId !== context.jobId) {
      // Job may have already been aborted or never started properly
      this.log.warn(`Abort called for job ${context.jobId} but current job is ${this.#currentJob?.jobId ?? 'none'}`);
    }

    this.log.debug(`Aborting job ${context.jobId}`);

    // Discard staging atomically
    await this.kvStore.transactionAsync(async () => {
      for (const store of this.#stores.values()) {
        await store.discardStaged(context);
      }
    });

    this.#currentJob = undefined;
    this.log.debug(`Job ${context.jobId} aborted`);
  }

  /**
   * Checks if there's a job currently in progress.
   */
  hasJobInProgress(): boolean {
    return this.#currentJob !== undefined;
  }
}
