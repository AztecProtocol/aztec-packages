import { randomBytes } from '@aztec/foundation/crypto/random';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';

/**
 * Interface that stores must implement to support staged writes.
 */
export interface StagedStore {
  /** Unique name identifying this store (used for tracking staged stores from JobCoordinator) */
  readonly storeName: string;

  /**
   * Commits staged data to main storage.
   * Should be called within a transaction for atomicity.
   *
   * @param jobId - The job identifier
   */
  commit(jobId: string): Promise<void>;

  /**
   * Discards staged data without committing.
   * Called on abort.
   *
   * @param jobId - The job identifier
   */
  discardStaged(jobId: string): Promise<void>;
}

/**
 * JobCoordinator manages job lifecycle and provides crash resilience for PXE operations.
 *
 * It uses a staged writes pattern:
 * 1. When a job begins, a unique job ID is created
 * 2. During the job, all writes go to staging (keyed by job ID)
 * 3. On commit, staging is promoted to main storage
 * 4. On abort, staged data is discarded
 *
 * Note: PXE should only rely on a single JobCoordinator instance, so it can eventually
 * orchestrate concurrent jobs. Right now it doesn't make a difference because we're
 * using a job queue with concurrency=1.
 */
export class JobCoordinator {
  private readonly log: Logger;

  /** The underlying KV store */
  kvStore: AztecAsyncKVStore;

  #currentJobId: string | undefined;
  #stores: Map<string, StagedStore> = new Map();

  constructor(kvStore: AztecAsyncKVStore, bindings?: LoggerBindings) {
    this.kvStore = kvStore;
    this.log = createLogger('pxe:job_coordinator', bindings);
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
   * Begins a new job and returns a job ID for staged writes.
   *
   * @returns Job ID to pass to store operations
   */
  beginJob(): string {
    if (this.#currentJobId) {
      throw new Error(
        `Cannot begin job: job ${this.#currentJobId} is already in progress. ` +
          `This should not happen - ensure jobs are properly committed or aborted.`,
      );
    }

    const jobId = randomBytes(8).toString('hex');
    this.#currentJobId = jobId;

    this.log.debug(`Started job ${jobId}`);
    return jobId;
  }

  /**
   * Commits a job by promoting all staged data to main storage.
   *
   * @param jobId - The job ID returned from beginJob
   */
  async commitJob(jobId: string): Promise<void> {
    if (!this.#currentJobId || this.#currentJobId !== jobId) {
      throw new Error(
        `Cannot commit job ${jobId}: no matching job in progress. ` + `Current job: ${this.#currentJobId ?? 'none'}`,
      );
    }

    this.log.debug(`Committing job ${jobId}`);

    // Commit all stores atomically in a single transaction.
    // Each store's commit is a no-op if it has no staged data (but that's up to each store to handle).
    await this.kvStore.transactionAsync(async () => {
      for (const store of this.#stores.values()) {
        await store.commit(jobId);
      }
    });

    this.#currentJobId = undefined;
    this.log.debug(`Job ${jobId} committed successfully`);
  }

  /**
   * Aborts a job by discarding all staged data.
   *
   * @param jobId - The job ID returned from beginJob
   */
  async abortJob(jobId: string): Promise<void> {
    if (!this.#currentJobId || this.#currentJobId !== jobId) {
      // Job may have already been aborted or never started properly
      this.log.warn(`Abort called for job ${jobId} but current job is ${this.#currentJobId ?? 'none'}`);
    }

    this.log.debug(`Aborting job ${jobId}`);

    for (const store of this.#stores.values()) {
      await store.discardStaged(jobId);
    }

    this.#currentJobId = undefined;
    this.log.debug(`Job ${jobId} aborted`);
  }

  /**
   * Checks if there's a job currently in progress.
   */
  hasJobInProgress(): boolean {
    return this.#currentJobId !== undefined;
  }
}
