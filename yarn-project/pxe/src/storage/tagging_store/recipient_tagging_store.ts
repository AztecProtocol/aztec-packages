import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class
 * is called SenderTaggingStore. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 *
 * @dev Chain reorgs do not need to be handled here because both the finalized and aged indexes refer to finalized
 * blocks, which by definition cannot be affected by reorgs.
 */
export class RecipientTaggingStore implements StagedStore {
  storeName: string = 'recipient_tagging';

  #store: AztecAsyncKVStore;

  #highestAgedIndex: AztecAsyncMap<string, number>;
  #highestFinalizedIndex: AztecAsyncMap<string, number>;

  // jobId => secret => number
  #highestAgedIndexForJob: Map<string, Map<string, number>>;

  // jobId => secret => number
  #highestFinalizedIndexForJob: Map<string, Map<string, number>>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#highestAgedIndex = this.#store.openMap('highest_aged_index');
    this.#highestFinalizedIndex = this.#store.openMap('highest_finalized_index');

    this.#highestAgedIndexForJob = new Map();
    this.#highestFinalizedIndexForJob = new Map();
  }

  #getHighestAgedIndexForJob(jobId: string): Map<string, number> {
    let highestAgedIndexForJob = this.#highestAgedIndexForJob.get(jobId);
    if (!highestAgedIndexForJob) {
      highestAgedIndexForJob = new Map();
      this.#highestAgedIndexForJob.set(jobId, highestAgedIndexForJob);
    }
    return highestAgedIndexForJob;
  }

  async #readHighestAgedIndex(jobId: string, secret: string): Promise<number | undefined> {
    return this.#getHighestAgedIndexForJob(jobId).get(secret) ?? (await this.#highestAgedIndex.getAsync(secret));
  }

  #writeHighestAgedIndex(jobId: string, secret: string, index: number) {
    this.#getHighestAgedIndexForJob(jobId).set(secret, index);
  }

  #getHighestFinalizedIndexForJob(jobId: string): Map<string, number> {
    let jobStagedHighestFinalizedIndex = this.#highestFinalizedIndexForJob.get(jobId);
    if (!jobStagedHighestFinalizedIndex) {
      jobStagedHighestFinalizedIndex = new Map();
      this.#highestFinalizedIndexForJob.set(jobId, jobStagedHighestFinalizedIndex);
    }
    return jobStagedHighestFinalizedIndex;
  }

  async #readHighestFinalizedIndex(jobId: string, secret: string): Promise<number | undefined> {
    return (
      this.#getHighestFinalizedIndexForJob(jobId).get(secret) ?? (await this.#highestFinalizedIndex.getAsync(secret))
    );
  }

  #writeHighestFinalizedIndex(jobId: string, secret: string, index: number) {
    this.#getHighestFinalizedIndexForJob(jobId).set(secret, index);
  }

  /**
   * Writes all job-specific in-memory data to persistent storage.
   *
   * @remark This method must run in a DB transaction context. It's designed to be called from JobCoordinator#commitJob.
   */
  async commit(jobId: string): Promise<void> {
    const highestAgedIndexForJob = this.#highestAgedIndexForJob.get(jobId);
    if (highestAgedIndexForJob) {
      for (const [secret, index] of highestAgedIndexForJob.entries()) {
        await this.#highestAgedIndex.set(secret, index);
      }
    }

    const highestFinalizedIndexForJob = this.#highestFinalizedIndexForJob.get(jobId);
    if (highestFinalizedIndexForJob) {
      for (const [secret, index] of highestFinalizedIndexForJob.entries()) {
        await this.#highestFinalizedIndex.set(secret, index);
      }
    }

    return this.discardStaged(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.#highestAgedIndexForJob.delete(jobId);
    this.#highestFinalizedIndexForJob.delete(jobId);
    return Promise.resolve();
  }

  getHighestAgedIndex(secret: DirectionalAppTaggingSecret, jobId: string): Promise<number | undefined> {
    return this.#readHighestAgedIndex(jobId, secret.toString());
  }

  async updateHighestAgedIndex(secret: DirectionalAppTaggingSecret, index: number, jobId: string): Promise<void> {
    const currentIndex = await this.#readHighestAgedIndex(jobId, secret.toString());
    if (currentIndex !== undefined && index <= currentIndex) {
      // Log sync should never set a lower highest aged index.
      throw new Error(`New highest aged index (${index}) must be higher than the current one (${currentIndex})`);
    }
    this.#writeHighestAgedIndex(jobId, secret.toString(), index);
  }

  getHighestFinalizedIndex(secret: DirectionalAppTaggingSecret, jobId: string): Promise<number | undefined> {
    return this.#readHighestFinalizedIndex(jobId, secret.toString());
  }

  async updateHighestFinalizedIndex(secret: DirectionalAppTaggingSecret, index: number, jobId: string): Promise<void> {
    const currentIndex = await this.#readHighestFinalizedIndex(jobId, secret.toString());
    if (currentIndex !== undefined && index < currentIndex) {
      // Log sync should never set a lower highest finalized index but it can happen that it would try to set the same
      // one because we are loading logs from highest aged index + 1 and not from the highest finalized index.
      throw new Error(`New highest finalized index (${index}) must be higher than the current one (${currentIndex})`);
    }
    this.#writeHighestFinalizedIndex(jobId, secret.toString(), index);
  }
}
