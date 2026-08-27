import { randomBytes } from '@aztec/foundation/crypto/random';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';

/**
 * Identifies a change set: the writes staged between a {@link StagedWriteCoordinator.begin} and its matching commit or
 * abort, which are promoted to the database or dropped as a unit.
 */
export type ChangeSetId = string;

/**
 * A store that buffers its writes per change set instead of sending them straight to the database.
 *
 * Every read and write on such a store takes a change set ID. Writes are held under that ID; a read sees the database
 * plus whatever its own change set has staged, never another's.
 *
 * {@link StagedWriteCoordinator} ends a change set by calling {@link commitChangeSet}, which promotes its staged writes
 * to the database, or {@link discardChangeSet}, which throws them away.
 */
export interface StagedStore {
  /** Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator) */
  readonly storeName: string;

  /**
   * Notifies the store that a change set has been opened.
   *
   * TODO: make it required once every staged store extends `BaseStagingStore`. It is optional only while
   * they migrate to per-change-set staging.
   *
   * @param changeSetId - The change set identifier
   */
  beginChangeSet?(changeSetId: ChangeSetId): void;

  /**
   * Commits staged data to persistent storage. Will be called within a db transaction for atomicity, alongside the
   * writes of all other staged stores for the same change set.
   *
   * @param changeSetId - The change set identifier
   */
  commitChangeSet(changeSetId: ChangeSetId): Promise<void>;

  /**
   * Discards staged data without committing. Called on abort.
   *
   * @param changeSetId - The change set identifier
   */
  discardChangeSet(changeSetId: ChangeSetId): void;
}

/**
 * StagedWriteCoordinator simulates a database transaction across the PXE stores, which some underlying KV stores
 * (e.g. IndexedDB) cannot provide on their own for long-running async operations.
 *
 * It uses a staged writes pattern:
 * 1. When a change set is opened, a unique ID is created
 * 2. While a change set is open, all writes are staged under its ID, and reads observe the staged data
 * 3. On commit, the staged data is promoted to persistent storage
 * 4. On abort, staged data is discarded
 *
 * Only one change set can be open at a time: {@link begin} throws if one already is. Supporting overlapping change
 * sets would mean merging them when one of them commits — a problem in its own right, and one no caller needs solved.
 * Avoiding that throw is up to the caller, which must serialize whatever opens change sets, e.g. with a queue.
 *
 * Staged data is nonetheless keyed by change set ID, because aborting a change set does not cancel the async work it
 * started. An oracle that was mid-write when the operation failed still finishes writing afterwards, and stages its
 * write under the aborted ID, which nothing will ever promote. Were staged data not keyed by ID, that late write
 * would instead sit in the store and be promoted by whichever change set commits next.
 */
export class StagedWriteCoordinator {
  readonly #kvStore: AztecAsyncKVStore;
  readonly #stagedStores: Map<string, StagedStore> = new Map();
  readonly #log: Logger;

  #currentChangeSetId: ChangeSetId | undefined;

  constructor(args: StagedWriteCoordinatorArgs) {
    this.#kvStore = args.kvStore;
    this.#log = createLogger('pxe:staged_write_coordinator', args.bindings);
    for (const store of args.stagedStores) {
      if (this.#stagedStores.has(store.storeName)) {
        throw new Error(`Store "${store.storeName}" is already registered`);
      }
      this.#stagedStores.set(store.storeName, store);
    }
  }

  /**
   * Opens a change set and returns its ID for staged writes.
   *
   * All or nothing: if a store fails to open the change set, the stores that already opened it discard it again and
   * nothing is left active, so a later change set can still be opened on this PXE instance.
   *
   * @returns Change set ID to pass to store operations
   * @throws If a change set is already open, or if a store rejects the new one.
   */
  begin(): ChangeSetId {
    if (this.#currentChangeSetId) {
      throw new Error(
        `Cannot open change set: change set ${this.#currentChangeSetId} is already active. ` +
          `This should not happen - ensure change sets are properly committed or aborted.`,
      );
    }

    const changeSetId = randomBytes(8).toString('hex');
    this.#beginChangeSetOnStores(changeSetId);
    this.#currentChangeSetId = changeSetId;
    this.#log.debug(`Opened change set ${changeSetId}`, { changeSetId });
    return changeSetId;
  }

  /**
   * Commits by promoting all staged data to persistent storage.
   *
   * Unlike {@link begin} and {@link abort}, a failed commit leaves the change set open, so the caller must still
   * {@link abort} it before another can be opened.
   *
   * @param changeSetId - The change set ID returned from begin
   * @throws If `changeSetId` is not the open change set, or if a store failed to commit.
   */
  async commit(changeSetId: ChangeSetId): Promise<void> {
    if (this.#currentChangeSetId !== changeSetId) {
      throw new Error(
        `Cannot commit change set ${changeSetId}: no matching change set active. ` +
          `Current change set: ${this.#currentChangeSetId ?? 'none'}`,
      );
    }

    this.#log.debug(`Committing change set ${changeSetId}`, { changeSetId });

    // Commit all stores atomically in a single transaction.
    await this.#kvStore.transactionAsync(async () => {
      for (const store of this.#stagedStores.values()) {
        await store.commitChangeSet(changeSetId);
      }
    });

    this.#currentChangeSetId = undefined;
    this.#log.debug(`Change set ${changeSetId} committed successfully`, { changeSetId });
  }

  /**
   * Aborts by discarding all staged data.
   *
   * Every store gets to drop its staged data even if an earlier one failed, and the change set always ends, so a
   * failed abort never blocks later change sets.
   *
   * @param changeSetId - The change set ID returned from begin
   * @throws If `changeSetId` is not the open change set, or if any store failed to discard.
   */
  abort(changeSetId: ChangeSetId): void {
    if (this.#currentChangeSetId !== changeSetId) {
      throw new Error(
        `Cannot abort change set ${changeSetId}: no matching change set active. ` +
          `Current change set: ${this.#currentChangeSetId ?? 'none'}`,
      );
    }

    this.#log.debug(`Aborting change set ${changeSetId}`, { changeSetId });

    this.#currentChangeSetId = undefined;
    this.#discardChangeSetOnStores(this.#stagedStores.values(), changeSetId);

    this.#log.debug(`Change set ${changeSetId} aborted`, { changeSetId });
  }

  /** Opens the change set on every store, undoing it on any that accepted if a later one rejects, and rethrows. */
  #beginChangeSetOnStores(changeSetId: ChangeSetId): void {
    const begunStores: StagedStore[] = [];
    try {
      for (const store of this.#stagedStores.values()) {
        store.beginChangeSet?.(changeSetId);
        begunStores.push(store);
      }
    } catch (err) {
      try {
        this.#discardChangeSetOnStores(begunStores, changeSetId);
      } catch (discardError) {
        // The original error is that a store failed to begin the changeset, and we're throwing that
        // unconditionally, so we just log this additional failure.
        this.#log.error(`Failed to roll back change set ${changeSetId} after a store rejected it`, discardError, {
          changeSetId,
        });
      }
      throw err;
    }
  }

  /** Discards the change set on every store in `stores`, throwing only once they have all had the chance. */
  #discardChangeSetOnStores(stores: Iterable<StagedStore>, changeSetId: ChangeSetId): void {
    // A store that fails must not stop the ones after it, so the failures are collected and thrown at the end.
    const failures: Error[] = [];
    for (const store of stores) {
      try {
        store.discardChangeSet(changeSetId);
      } catch (err) {
        failures.push(
          new Error(
            `Store "${store.storeName}" failed to discard change set ${changeSetId} and may still hold staged data.`,
            { cause: err },
          ),
        );
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    } else if (failures.length > 1) {
      throw new AggregateError(failures);
    }
  }
}

/** Dependencies of the {@link StagedWriteCoordinator}. */
type StagedWriteCoordinatorArgs = {
  kvStore: AztecAsyncKVStore;
  stagedStores: StagedStore[];
  bindings?: LoggerBindings;
};
