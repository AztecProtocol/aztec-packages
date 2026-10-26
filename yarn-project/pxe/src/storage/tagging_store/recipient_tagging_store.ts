import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AppTaggingSecret } from '@aztec/stdlib/logs';

import { BaseStagingStore, type ReadonlyDb } from '../base_staging_store.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class
 * is called SenderTaggingStore. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 *
 * @dev Chain reorgs do not need to be handled here because both the finalized and aged indexes refer to finalized
 * blocks, which by definition cannot be affected by reorgs.
 */
export class RecipientTaggingStore extends BaseStagingStore<RecipientTaggingChangeSet, RecipientTaggingDb> {
  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'recipient_tagging',
      store,
      buildChangeSet: () => ({ highestAgedIndexes: new Map(), highestFinalizedIndexes: new Map() }),
      buildDb: db => ({
        highestAgedIndex: db.openMap('highest_aged_index'),
        highestFinalizedIndex: db.openMap('highest_finalized_index'),
      }),
    });
  }

  async #readHighestAgedIndex(
    changeSet: RecipientTaggingChangeSet,
    db: ReadonlyDb<RecipientTaggingDb>,
    secret: SecretStr,
  ): Promise<Index | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await db.highestAgedIndex.getAsync(secret);
    return changeSet.highestAgedIndexes.get(secret) ?? dbValue;
  }

  async #readHighestFinalizedIndex(
    changeSet: RecipientTaggingChangeSet,
    db: ReadonlyDb<RecipientTaggingDb>,
    secret: SecretStr,
  ): Promise<Index | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await db.highestFinalizedIndex.getAsync(secret);
    return changeSet.highestFinalizedIndexes.get(secret) ?? dbValue;
  }

  protected async flushChangeSet(changeSet: RecipientTaggingChangeSet, db: RecipientTaggingDb): Promise<void> {
    for (const [secret, index] of changeSet.highestAgedIndexes) {
      await db.highestAgedIndex.set(secret, index);
    }

    for (const [secret, index] of changeSet.highestFinalizedIndexes) {
      await db.highestFinalizedIndex.set(secret, index);
    }
  }

  /** No-op: both indexes refer to finalized blocks, which a prune cannot remove. */
  protected applyRollback(): Promise<void> {
    return Promise.resolve();
  }

  getHighestAgedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<Index | undefined> {
    return this.withChangeSetAndDb(changeSetId, (changeSet, db) =>
      this.#readHighestAgedIndex(changeSet, db, secret.toString()),
    );
  }

  updateHighestAgedIndex(secret: AppTaggingSecret, index: Index, changeSetId: ChangeSetId): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const currentIndex = await this.#readHighestAgedIndex(changeSet, db, secret.toString());
      if (currentIndex !== undefined && index <= currentIndex) {
        // Log sync should never set a lower highest aged index.
        throw new Error(`New highest aged index (${index}) must be higher than the current one (${currentIndex})`);
      }
      changeSet.highestAgedIndexes.set(secret.toString(), index);
    });
  }

  getHighestFinalizedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<Index | undefined> {
    return this.withChangeSetAndDb(changeSetId, (changeSet, db) =>
      this.#readHighestFinalizedIndex(changeSet, db, secret.toString()),
    );
  }

  updateHighestFinalizedIndex(secret: AppTaggingSecret, index: Index, changeSetId: ChangeSetId): Promise<void> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const currentIndex = await this.#readHighestFinalizedIndex(changeSet, db, secret.toString());
      if (currentIndex !== undefined && index < currentIndex) {
        // Log sync should never set a lower highest finalized index but it can happen that it would try to set the same
        // one because we are loading logs from highest aged index + 1 and not from the highest finalized index.
        throw new Error(`New highest finalized index (${index}) must be higher than the current one (${currentIndex})`);
      }
      changeSet.highestFinalizedIndexes.set(secret.toString(), index);
    });
  }
}

/// Alias types for kv map readability
type SecretStr = string;
type Index = number;

/** A change set's staged data, created and discarded as a unit: both indexes, each keyed by tagging secret. */
type RecipientTaggingChangeSet = {
  highestAgedIndexes: Map<SecretStr, Index>;
  highestFinalizedIndexes: Map<SecretStr, Index>;
};

type RecipientTaggingDb = {
  highestAgedIndex: AztecAsyncMap<SecretStr, Index>;
  highestFinalizedIndex: AztecAsyncMap<SecretStr, Index>;
};
