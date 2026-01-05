import { randomBytes } from '@aztec/foundation/crypto/random';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';

import { JobContext, type SerializedJobContext, serializeJobContext } from './job_context.js';

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
  commitStaged(context: JobContext): Promise<void>;

  /**
   * Discards staged data without committing.
   * Called on abort or during recovery.
   *
   * @param stagingPrefix - The prefix used for staging keys
   */
  discardStaged(stagingPrefix: string): Promise<void>;
}

/**
 * JobCoordinator manages job lifecycle and provides crash resilience for PXE operations.
 *
 * It uses a staged writes pattern:
 * 1. When a job begins, a marker is persisted with the job details
 * 2. During the job, all writes go to staging (prefixed keys)
 * 3. On commit, staging is promoted to main storage and marker is cleared
 * 4. On crash, recovery discards staging and clears the marker
 */
export class JobCoordinator {
  private readonly log = createLogger('pxe:job_coordinator');

  /** The underlying KV store */
  #store: AztecAsyncKVStore;

  /** Persisted job marker - indicates a job is in progress */
  #currentJob: AztecAsyncSingleton<Buffer>;

  /** All registered staging providers */
  #providers: Map<string, StagedStore> = new Map();

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#currentJob = store.openSingleton('pxe_current_job');
  }

  /**
   * Registers a data provider that supports staging.
   * Must be called during initialization for all providers that need staging support.
   */
  registerProvider(provider: StagedStore): void {
    if (this.#providers.has(provider.storeName)) {
      throw new Error(`Provider "${provider.storeName}" is already registered`);
    }
    this.#providers.set(provider.storeName, provider);
    this.log.debug(`Registered staging provider: ${provider.storeName}`);
  }

  /**
   * Begins a new job and returns a context for staged writes.
   *
   * @param jobType - Type of job (for logging/debugging)
   * @returns JobContext to pass to write operations
   */
  async beginJob(jobType: string): Promise<JobContext> {
    // Check if there's already a job in progress
    const existingJob = await this.#getCurrentJob();
    if (existingJob) {
      throw new Error(
        `Cannot begin job "${jobType}": job "${existingJob.jobType}" (${existingJob.jobId}) is already in progress. ` +
          `This should not happen - ensure jobs are properly committed or aborted.`,
      );
    }

    // Generate unique job ID
    const jobId = randomBytes(8).toString('hex');
    const context = new JobContext(jobId, jobType);

    // Persist the job marker before returning
    await this.#setCurrentJob(context);

    this.log.debug(`Started job ${jobId} (type: ${jobType})`);
    return context;
  }

  /**
   * Commits a job by promoting all staged data to main storage.
   *
   * @param context - The job context returned from beginJob
   */
  async commitJob(context: JobContext): Promise<void> {
    const currentJob = await this.#getCurrentJob();
    if (!currentJob || currentJob.jobId !== context.jobId) {
      throw new Error(
        `Cannot commit job ${context.jobId}: no matching job in progress. ` +
          `Current job: ${currentJob ? currentJob.jobId : 'none'}`,
      );
    }

    this.log.debug(`Committing job ${context.jobId}`);

    // Commit all providers atomically in a single transaction.
    // Each provider's commitStaged is a no-op if it has no staged data.
    await this.#store.transactionAsync(async () => {
      for (const provider of this.#providers.values()) {
        await provider.commitStaged(context);
      }

      // Clear the job marker within the same transaction
      await this.#currentJob.delete();
    });

    this.log.debug(`Job ${context.jobId} committed successfully`);
  }

  /**
   * Aborts a job by discarding all staged data.
   *
   * @param context - The job context returned from beginJob
   */
  async abortJob(context: JobContext): Promise<void> {
    const currentJob = await this.#getCurrentJob();
    if (!currentJob || currentJob.jobId !== context.jobId) {
      // Job may have already been aborted or never started properly
      this.log.warn(`Abort called for job ${context.jobId} but current job is ${currentJob?.jobId ?? 'none'}`);
    }

    this.log.debug(`Aborting job ${context.jobId}`);

    // Discard staging for all providers (each is a no-op if no staged data)
    for (const provider of this.#providers.values()) {
      await provider.discardStaged(context.stagingPrefix);
    }

    // Clear the job marker
    await this.#clearCurrentJob();

    this.log.debug(`Job ${context.jobId} aborted`);
  }

  /**
   * Recovers from an incomplete job on startup.
   * Should be called before any other operations.
   *
   * If a job was in progress when PXE crashed, this will discard
   * all staged data and clear the job marker.
   */
  async recover(): Promise<void> {
    const job = await this.#getCurrentJob();
    if (!job) {
      this.log.debug('No incomplete job found, clean startup');
      return;
    }

    this.log.warn(
      `Found incomplete job ${job.jobId} (type: ${job.jobType}) from ${new Date(job.startedAt).toISOString()}. ` +
        `Discarding staged data...`,
    );

    // Reconstruct the context for recovery
    const context = new JobContext(job.jobId, job.jobType);

    // Discard staging from all registered providers
    for (const provider of this.#providers.values()) {
      try {
        await provider.discardStaged(context.stagingPrefix);
      } catch (err) {
        this.log.error(`Failed to discard staging for ${provider.storeName}:`, err);
        // Continue with other stores
      }
    }

    // Clear the job marker
    await this.#clearCurrentJob();

    this.log.info(`Recovered from incomplete job ${job.jobId}`);
  }

  /**
   * Checks if there's a job currently in progress.
   */
  async hasJobInProgress(): Promise<boolean> {
    return (await this.#getCurrentJob()) !== undefined;
  }

  async #getCurrentJob(): Promise<SerializedJobContext | undefined> {
    const buffer = await this.#currentJob.getAsync();
    if (!buffer) {
      return undefined;
    }
    try {
      // Use TextDecoder for cross-platform compatibility (Node.js Buffer vs browser Uint8Array)
      const text = new TextDecoder().decode(buffer);
      return JSON.parse(text) as SerializedJobContext;
    } catch {
      this.log.warn('Failed to parse current job marker, treating as no job');
      return undefined;
    }
  }

  async #setCurrentJob(context: JobContext): Promise<void> {
    const serialized = serializeJobContext(context);
    // Use TextEncoder for cross-platform compatibility
    await this.#currentJob.set(Buffer.from(new TextEncoder().encode(JSON.stringify(serialized))));
  }

  async #clearCurrentJob(): Promise<void> {
    await this.#currentJob.delete();
  }
}
