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
 * {@link StagedWriteCoordinator} ends a change set by calling {@link commitStaged}, which promotes its staged writes
 * to the database, or {@link discardStaged}, which throws them away.
 */
export interface StagedStore {
  /** Unique name identifying this store (used for tracking staged stores from StagedWriteCoordinator) */
  readonly storeName: string;

  /**
   * Commits staged data to persistent storage. Will be called within a db transaction for atomicity, alongside the
   * writes of all other staged stores for the same change set.
   *
   * @param changeSetId - The change set identifier
   */
  commitStaged(changeSetId: ChangeSetId): Promise<void>;

  /**
   * Discards staged data without committing. Called on abort.
   *
   * @param changeSetId - The change set identifier
   */
  discardStaged(changeSetId: ChangeSetId): Promise<void>;
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
   * @returns Change set ID to pass to store operations
   */
  begin(): ChangeSetId {
    if (this.#currentChangeSetId) {
      throw new Error(
        `Cannot open change set: change set ${this.#currentChangeSetId} is already active. ` +
          `This should not happen - ensure change sets are properly committed or aborted.`,
      );
    }

    const changeSetId = randomBytes(8).toString('hex');
    this.#currentChangeSetId = changeSetId;

    this.#log.debug(`Opened change set ${changeSetId}`, { changeSetId });
    return changeSetId;
  }

  /**
   * Commits by promoting all staged data to persistent storage.
   *
   * @param changeSetId - The change set ID returned from begin
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
    // Each store's commit is a no-op if it has no staged data (but that's up to each store to handle).
    await this.#kvStore.transactionAsync(async () => {
      for (const store of this.#stagedStores.values()) {
        await store.commitStaged(changeSetId);
      }
    });

    this.#currentChangeSetId = undefined;
    this.#log.debug(`Change set ${changeSetId} committed successfully`, { changeSetId });
  }

  /**
   * Aborts by discarding all staged data.
   *
   * @param changeSetId - The change set ID returned from begin
   */
  async abort(changeSetId: ChangeSetId): Promise<void> {
    if (this.#currentChangeSetId !== changeSetId) {
      throw new Error(
        `Cannot abort change set ${changeSetId}: no matching change set active. ` +
          `Current change set: ${this.#currentChangeSetId ?? 'none'}`,
      );
    }

    this.#log.debug(`Aborting change set ${changeSetId}`, { changeSetId });

    for (const store of this.#stagedStores.values()) {
      await store.discardStaged(changeSetId);
    }

    this.#currentChangeSetId = undefined;
    this.#log.debug(`Change set ${changeSetId} aborted`, { changeSetId });
  }
}

/** Dependencies of the {@link StagedWriteCoordinator}. */
type StagedWriteCoordinatorArgs = {
  kvStore: AztecAsyncKVStore;
  stagedStores: StagedStore[];
  bindings?: LoggerBindings;
};
