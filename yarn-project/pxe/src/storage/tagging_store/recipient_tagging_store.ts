import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import type { JobContext } from '../../job_coordinator/index.js';
import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class
 * is called SenderTaggingStore. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 *
 * @dev Chain reorgs do not need to be handled here because both the finalized and aged indexes refer to finalized
 * blocks, which by definition cannot be affected by reorgs.
 *
 * TODO(benesjan): Relocate to yarn-project/pxe/src/storage/tagging_store
 */
type StagedIndexes = { highestAgedIndex?: number; highestFinalizedIndex?: number };

export class RecipientTaggingStore implements StagedStore {
  readonly storeName = 'recipient_tagging';

  #store: AztecAsyncKVStore;

  #highestAgedIndex: AztecAsyncMap<string, number>;
  #highestFinalizedIndex: AztecAsyncMap<string, number>;

  /** In-memory staging: jobId -> secret -> { highestAgedIndex?, highestFinalizedIndex? } */
  #stagedIndexes: Map<string, Map<string, StagedIndexes>>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#highestAgedIndex = this.#store.openMap('highest_aged_index');
    this.#highestFinalizedIndex = this.#store.openMap('highest_finalized_index');
    this.#stagedIndexes = new Map();
  }

  getHighestAgedIndex(secret: DirectionalAppTaggingSecret, context?: JobContext): Promise<number | undefined> {
    // Check staging first if context provided
    if (context) {
      const jobStaging = this.#stagedIndexes.get(context.jobId);
      const staged = jobStaging?.get(secret.toString());
      if (staged?.highestAgedIndex !== undefined) {
        return Promise.resolve(staged.highestAgedIndex);
      }
    }
    // Fall back to committed data
    return this.#highestAgedIndex.getAsync(secret.toString());
  }

  async updateHighestAgedIndex(
    secret: DirectionalAppTaggingSecret,
    index: number,
    context?: JobContext,
  ): Promise<void> {
    const currentIndex = await this.getHighestAgedIndex(secret, context);
    if (currentIndex !== undefined && index <= currentIndex) {
      // Log sync should never set a lower highest aged index.
      throw new Error(`New highest aged index (${index}) must be higher than the current one (${currentIndex})`);
    }

    if (context) {
      // Stage the update
      let jobStaging = this.#stagedIndexes.get(context.jobId);
      if (!jobStaging) {
        jobStaging = new Map();
        this.#stagedIndexes.set(context.jobId, jobStaging);
      }
      const existing = jobStaging.get(secret.toString()) || {};
      jobStaging.set(secret.toString(), { ...existing, highestAgedIndex: index });
    } else {
      await this.#highestAgedIndex.set(secret.toString(), index);
    }
  }

  getHighestFinalizedIndex(secret: DirectionalAppTaggingSecret, context?: JobContext): Promise<number | undefined> {
    // Check staging first if context provided
    if (context) {
      const jobStaging = this.#stagedIndexes.get(context.jobId);
      const staged = jobStaging?.get(secret.toString());
      if (staged?.highestFinalizedIndex !== undefined) {
        return Promise.resolve(staged.highestFinalizedIndex);
      }
    }
    // Fall back to committed data
    return this.#highestFinalizedIndex.getAsync(secret.toString());
  }

  async updateHighestFinalizedIndex(
    secret: DirectionalAppTaggingSecret,
    index: number,
    context?: JobContext,
  ): Promise<void> {
    const currentIndex = await this.getHighestFinalizedIndex(secret, context);
    if (currentIndex !== undefined && index < currentIndex) {
      // Log sync should never set a lower highest finalized index but it can happen that it would try to set the same
      // one because we are loading logs from highest aged index + 1 and not from the highest finalized index.
      throw new Error(`New highest finalized index (${index}) must be higher than the current one (${currentIndex})`);
    }

    if (context) {
      // Stage the update
      let jobStaging = this.#stagedIndexes.get(context.jobId);
      if (!jobStaging) {
        jobStaging = new Map();
        this.#stagedIndexes.set(context.jobId, jobStaging);
      }
      const existing = jobStaging.get(secret.toString()) || {};
      jobStaging.set(secret.toString(), { ...existing, highestFinalizedIndex: index });
    } else {
      await this.#highestFinalizedIndex.set(secret.toString(), index);
    }
  }

  // StagedStore implementation

  async commitStaged(context: JobContext): Promise<void> {
    const jobStaging = this.#stagedIndexes.get(context.jobId);
    if (!jobStaging) {
      return;
    }

    //TODO(mverzilli): check if it's better to parallelize these writes
    for (const [secretStr, staged] of jobStaging) {
      if (staged.highestAgedIndex !== undefined) {
        await this.#highestAgedIndex.set(secretStr, staged.highestAgedIndex);
      }
      if (staged.highestFinalizedIndex !== undefined) {
        await this.#highestFinalizedIndex.set(secretStr, staged.highestFinalizedIndex);
      }
    }

    this.#stagedIndexes.delete(context.jobId);
  }

  discardStaged(stagingPrefix: string): Promise<void> {
    // Extract jobId from prefix format "job_{jobId}:"
    const jobId = stagingPrefix.slice(4, -1);
    this.#stagedIndexes.delete(jobId);
    return Promise.resolve();
  }
}
