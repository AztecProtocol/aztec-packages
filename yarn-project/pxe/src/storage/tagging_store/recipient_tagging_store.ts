import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AppTaggingSecret } from '@aztec/stdlib/logs';

import type { ChangeSetId, StagedStore } from '../staged_write_coordinator.js';

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

  // changeSetId => secret => number
  #highestAgedIndexForChangeSet: Map<ChangeSetId, Map<string, number>>;

  // changeSetId => secret => number
  #highestFinalizedIndexForChangeSet: Map<ChangeSetId, Map<string, number>>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#highestAgedIndex = this.#store.openMap('highest_aged_index');
    this.#highestFinalizedIndex = this.#store.openMap('highest_finalized_index');

    this.#highestAgedIndexForChangeSet = new Map();
    this.#highestFinalizedIndexForChangeSet = new Map();
  }

  #getHighestAgedIndexForChangeSet(changeSetId: ChangeSetId): Map<string, number> {
    let highestAgedIndexForChangeSet = this.#highestAgedIndexForChangeSet.get(changeSetId);
    if (!highestAgedIndexForChangeSet) {
      highestAgedIndexForChangeSet = new Map();
      this.#highestAgedIndexForChangeSet.set(changeSetId, highestAgedIndexForChangeSet);
    }
    return highestAgedIndexForChangeSet;
  }

  async #readHighestAgedIndex(changeSetId: ChangeSetId, secret: string): Promise<number | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await this.#highestAgedIndex.getAsync(secret);
    const staged = this.#getHighestAgedIndexForChangeSet(changeSetId).get(secret);
    return staged ?? dbValue;
  }

  #writeHighestAgedIndex(changeSetId: ChangeSetId, secret: string, index: number) {
    this.#getHighestAgedIndexForChangeSet(changeSetId).set(secret, index);
  }

  #getHighestFinalizedIndexForChangeSet(changeSetId: ChangeSetId): Map<string, number> {
    let stagedHighestFinalizedIndex = this.#highestFinalizedIndexForChangeSet.get(changeSetId);
    if (!stagedHighestFinalizedIndex) {
      stagedHighestFinalizedIndex = new Map();
      this.#highestFinalizedIndexForChangeSet.set(changeSetId, stagedHighestFinalizedIndex);
    }
    return stagedHighestFinalizedIndex;
  }

  async #readHighestFinalizedIndex(changeSetId: ChangeSetId, secret: string): Promise<number | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await this.#highestFinalizedIndex.getAsync(secret);
    const staged = this.#getHighestFinalizedIndexForChangeSet(changeSetId).get(secret);
    return staged ?? dbValue;
  }

  #writeHighestFinalizedIndex(changeSetId: ChangeSetId, secret: string, index: number) {
    this.#getHighestFinalizedIndexForChangeSet(changeSetId).set(secret, index);
  }

  /**
   * Writes all change set-specific in-memory data to persistent storage.
   *
   * @remark This method must run in a DB transaction context. It's designed to be called from
   * {@link StagedWriteCoordinator.commit}.
   */
  async commitStaged(changeSetId: ChangeSetId): Promise<void> {
    const highestAgedIndexForChangeSet = this.#highestAgedIndexForChangeSet.get(changeSetId);
    if (highestAgedIndexForChangeSet) {
      for (const [secret, index] of highestAgedIndexForChangeSet.entries()) {
        await this.#highestAgedIndex.set(secret, index);
      }
    }

    const highestFinalizedIndexForChangeSet = this.#highestFinalizedIndexForChangeSet.get(changeSetId);
    if (highestFinalizedIndexForChangeSet) {
      for (const [secret, index] of highestFinalizedIndexForChangeSet.entries()) {
        await this.#highestFinalizedIndex.set(secret, index);
      }
    }

    return this.discardStaged(changeSetId);
  }

  discardStaged(changeSetId: ChangeSetId): Promise<void> {
    this.#highestAgedIndexForChangeSet.delete(changeSetId);
    this.#highestFinalizedIndexForChangeSet.delete(changeSetId);
    return Promise.resolve();
  }

  getHighestAgedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<number | undefined> {
    return this.#store.transactionAsync(() => this.#readHighestAgedIndex(changeSetId, secret.toString()));
  }

  updateHighestAgedIndex(secret: AppTaggingSecret, index: number, changeSetId: ChangeSetId): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const currentIndex = await this.#readHighestAgedIndex(changeSetId, secret.toString());
      if (currentIndex !== undefined && index <= currentIndex) {
        // Log sync should never set a lower highest aged index.
        throw new Error(`New highest aged index (${index}) must be higher than the current one (${currentIndex})`);
      }
      this.#writeHighestAgedIndex(changeSetId, secret.toString(), index);
    });
  }

  getHighestFinalizedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<number | undefined> {
    return this.#store.transactionAsync(() => this.#readHighestFinalizedIndex(changeSetId, secret.toString()));
  }

  updateHighestFinalizedIndex(secret: AppTaggingSecret, index: number, changeSetId: ChangeSetId): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const currentIndex = await this.#readHighestFinalizedIndex(changeSetId, secret.toString());
      if (currentIndex !== undefined && index < currentIndex) {
        // Log sync should never set a lower highest finalized index but it can happen that it would try to set the same
        // one because we are loading logs from highest aged index + 1 and not from the highest finalized index.
        throw new Error(`New highest finalized index (${index}) must be higher than the current one (${currentIndex})`);
      }
      this.#writeHighestFinalizedIndex(changeSetId, secret.toString(), index);
    });
  }
}
