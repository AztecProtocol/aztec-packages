import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InTx, TxHash } from '@aztec/stdlib/tx';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { PackedPrivateEvent } from '../../pxe.js';
import { StoredPrivateEvent } from './stored_private_event.js';

export type PrivateEventStoreFilter = {
  contractAddress: AztecAddress;
  fromBlock: number;
  toBlock: number;
  scopes: AztecAddress[];
  txHash?: TxHash;
};

type PrivateEventMetadata = InTx & {
  contractAddress: AztecAddress;
  scope: AztecAddress;
  /** The index of the tx within the block */
  txIndexInBlock: number;
  /** The index of the event within the tx (based on nullifier position) */
  eventIndexInTx: number;
};

/**
 * Stores decrypted private event logs.
 */
export class PrivateEventStore implements StagedStore {
  readonly storeName: string = 'private_event';

  #store: AztecAsyncKVStore;
  /** Actual private event log entries, keyed by siloedEventCommitment */
  #events: AztecAsyncMap<string, Buffer>;
  /** Multi-map from contractAddress_eventSelector to siloedEventCommitment for efficient lookup */
  #eventsByContractAndEventSelector: AztecAsyncMultiMap<string, string>;
  /** Multi-map from block number to siloedEventCommitment for rollback support */
  #eventsByBlockNumber: AztecAsyncMultiMap<number, string>;

  /** jobId => eventId (event siloed nullifier) => StoredPrivateEvent */
  #eventsForJob: Map<string, Map<string, StoredPrivateEvent>>;

  /** Per-job locks to prevent concurrent writes from affecting each other. */
  #jobLocks: Map<string, Semaphore>;

  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#events = this.#store.openMap('private_event_logs');
    this.#eventsByContractAndEventSelector = this.#store.openMultiMap('events_by_contract_selector');
    this.#eventsByBlockNumber = this.#store.openMultiMap('events_by_block_number');

    this.#eventsForJob = new Map();
    this.#jobLocks = new Map();
  }

  /**
   * Store a private event log.
   * @param eventSelector - The event selector of the event.
   * @param randomness - The randomness used for the event commitment.
   * @param msgContent - The content of the event.
   * @param siloedEventCommitment - The siloed event commitment (used as unique identifier).
   * @param metadata
   *  contractAddress - The address of the contract that emitted the event.
   *  scope - The address to which the event is scoped.
   *  txHash - The transaction hash of the event log.
   *  blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    eventSelector: EventSelector,
    randomness: Fr,
    msgContent: Fr[],
    siloedEventCommitment: Fr,
    metadata: PrivateEventMetadata,
    jobId: string,
  ) {
    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(async () => {
        const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash, txIndexInBlock, eventIndexInTx } = metadata;
        const eventId = siloedEventCommitment.toString();

        this.logger.verbose('storing private event log (job stage)', {
          eventId,
          contractAddress,
          scope,
          msgContent,
          l2BlockNumber,
        });

        const existing = await this.#readEvent(eventId, jobId);

        if (existing) {
          // If we already stored this event, we still want to make sure to track it for the given scope
          existing.addScope(scope.toString());
          this.#writeEvent(eventId, existing, jobId);
        } else {
          this.#writeEvent(
            eventId,
            new StoredPrivateEvent(
              randomness,
              msgContent,
              l2BlockNumber,
              l2BlockHash,
              txHash,
              txIndexInBlock,
              eventIndexInTx,
              contractAddress,
              eventSelector,
              new Set([scope.toString()]),
            ),
            jobId,
          );
        }
      }),
    );
  }

  /**
   * Returns the private events given search parameters.
   * @param eventSelector - The event selector to filter by.
   * @param filter - Filtering criteria:
   *  contractAddress: The address of the contract to get events from.
   *  fromBlock: The block number to search from (inclusive).
   *  toBlock: The block number to search upto (exclusive).
   *  scope: - The addresses that decrypted the logs.
   * @returns - The event log contents, augmented with metadata about the transaction and block in which the event was
   * included.
   */
  public getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventStoreFilter,
  ): Promise<PackedPrivateEvent[]> {
    return this.#store.transactionAsync(async () => {
      const key = this.#keyFor(filter.contractAddress, eventSelector);
      const targetScopes = new Set(filter.scopes.map(s => s.toString()));

      // Map from eventId to the promise that reads the event buffer.
      // We start reads during iteration to keep DB requests pending and avoid IndexedDB auto-commit.
      const eventReadPromises: Map<string, Promise<Buffer | undefined>> = new Map();

      for await (const eventId of this.#eventsByContractAndEventSelector.getValuesAsync(key)) {
        eventReadPromises.set(eventId, this.#events.getAsync(eventId));
      }

      const eventIds = [...eventReadPromises.keys()];
      const eventBuffers = await Promise.all(eventReadPromises.values());

      const events: Array<{
        l2BlockNumber: number;
        txIndexInBlock: number;
        eventIndexInTx: number;
        event: PackedPrivateEvent;
      }> = [];

      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const eventBuffer = eventBuffers[i];

        // Defensive, if it happens, there's a problem with how we're handling #eventsByContractAndEventSelector
        if (!eventBuffer) {
          this.logger.verbose(
            `EventId ${eventId} does not exist in main index but it is referenced from contract event selector index`,
          );
          continue;
        }

        const storedPrivateEvent = StoredPrivateEvent.fromBuffer(eventBuffer);

        // Filter by block range
        if (storedPrivateEvent.l2BlockNumber < filter.fromBlock || storedPrivateEvent.l2BlockNumber >= filter.toBlock) {
          continue;
        }

        // Filter by scopes
        if (storedPrivateEvent.scopes.intersection(targetScopes).size === 0) {
          continue;
        }

        // Filter by txHash
        if (filter.txHash && !storedPrivateEvent.txHash.equals(filter.txHash)) {
          continue;
        }

        events.push({
          l2BlockNumber: storedPrivateEvent.l2BlockNumber,
          txIndexInBlock: storedPrivateEvent.txIndexInBlock,
          eventIndexInTx: storedPrivateEvent.eventIndexInTx,
          event: {
            packedEvent: storedPrivateEvent.msgContent,
            l2BlockNumber: BlockNumber(storedPrivateEvent.l2BlockNumber),
            txHash: storedPrivateEvent.txHash,
            l2BlockHash: storedPrivateEvent.l2BlockHash,
            eventSelector,
          },
        });
      }

      // Sort by block number, then by tx index within block, then by event index within tx
      events.sort((a, b) => {
        if (a.l2BlockNumber !== b.l2BlockNumber) {
          return a.l2BlockNumber - b.l2BlockNumber;
        }
        if (a.txIndexInBlock !== b.txIndexInBlock) {
          return a.txIndexInBlock - b.txIndexInBlock;
        }
        return a.eventIndexInTx - b.eventIndexInTx;
      });

      return events.map(ev => ev.event);
    });
  }

  /**
   * Rolls back private events that were stored after a given `blockNumber` and up to `synchedBlockNumber` (the block
   * number up to which PXE managed to sync before the reorg happened).
   *
   * We don't need staged writes for a rollback since it's handled in the context of a blockchain rewind.
   *
   * Rollbacks are handled by the BlockSynchronizer, which runs a DB transaction across stores when it detects a
   * re-org, including setting the new anchor block after rolling back.
   *
   * So if anything fails in the process of rolling back any store, all DB changes occurring during rollbacks will be
   * lost and the anchor block will not be updated; which means this code will eventually need to run again
   * (i.e.: PXE will detect it's basing it work on an invalid block hash, then which re-triggers rewind).
   *
   * For further details, refer to `BlockSynchronizer#handleBlockStreamEvent`.
   *
   * IMPORTANT: This method must be called within a transaction to ensure atomicity.
   */
  public async rollback(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    // First pass: collect all event IDs for all blocks, starting reads during iteration to keep tx alive.
    const eventsByBlock: Map<number, { eventId: string; eventReadPromise: Promise<Buffer | undefined> }[]> = new Map();

    for (let block = blockNumber + 1; block <= synchedBlockNumber; block++) {
      const blockEvents: { eventId: string; eventReadPromise: Promise<Buffer | undefined> }[] = [];
      for await (const eventId of this.#eventsByBlockNumber.getValuesAsync(block)) {
        // Start read immediately during iteration to keep IndexedDB transaction alive
        blockEvents.push({ eventId, eventReadPromise: this.#events.getAsync(eventId) });
      }
      if (blockEvents.length > 0) {
        eventsByBlock.set(block, blockEvents);
      }
    }

    // Second pass: await reads and perform deletes
    let removedCount = 0;
    for (const [block, events] of eventsByBlock) {
      await this.#eventsByBlockNumber.delete(block);

      for (const { eventId, eventReadPromise } of events) {
        const buffer = await eventReadPromise;
        if (!buffer) {
          throw new Error(`Event not found for eventId ${eventId}`);
        }

        const entry = StoredPrivateEvent.fromBuffer(buffer);
        await this.#events.delete(eventId);
        await this.#eventsByContractAndEventSelector.deleteValue(
          this.#keyFor(entry.contractAddress, entry.eventSelector),
          eventId,
        );

        removedCount++;
      }
    }

    this.logger.verbose(`Rolled back ${removedCount} private events after block ${blockNumber}`);
  }

  /**
   * Commits in memory job data to persistent storage.
   *
   * Called by JobCoordinator when a job completes successfully.
   *
   * Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here
   * (and using one would throw on IndexedDB as it does not support nested txs).
   *
   * @param jobId - The jobId identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    // Note: Don't use #withJobLock here - commit runs within JobCoordinator's transactionAsync,
    // and awaiting the lock would create a microtask boundary with no pending DB request,
    // causing IndexedDB to auto-commit the transaction.
    for (const [eventId, entry] of this.#getEventsForJob(jobId).entries()) {
      const lookupKey = this.#keyFor(entry.contractAddress, entry.eventSelector);
      this.logger.verbose('storing private event log', { eventId, lookupKey });

      await Promise.all([
        this.#events.set(eventId, entry.toBuffer()),
        this.#eventsByContractAndEventSelector.set(lookupKey, eventId),
        this.#eventsByBlockNumber.set(entry.l2BlockNumber, eventId),
      ]);
    }

    this.#clearJobData(jobId);
  }

  /**
   * Discards in memory job data without persisting it.
   */
  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  /**
   * Reads an event from in-memory job data first, falling back to persistent storage if not found.
   *
   * Returns undefined if the event does not exist in the store overall.
   */
  async #readEvent(eventId: string, jobId: string): Promise<StoredPrivateEvent | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const buffer = await this.#events.getAsync(eventId);
    const eventForJob = this.#getEventsForJob(jobId).get(eventId);
    return eventForJob ?? (buffer ? StoredPrivateEvent.fromBuffer(buffer) : undefined);
  }

  /**
   * Writes an event to in-memory job data.
   *
   * Writes are only allowed in a job context. Events modified during a job will only be persisted when `commit` is
   * called.
   */
  #writeEvent(eventId: string, entry: StoredPrivateEvent, jobId: string) {
    this.#getEventsForJob(jobId).set(eventId, entry);
  }

  /**
   * Get in-memory data only visible to @param jobId
   */
  #getEventsForJob(jobId: string): Map<string, StoredPrivateEvent> {
    let eventsForJob = this.#eventsForJob.get(jobId);
    if (eventsForJob === undefined) {
      eventsForJob = new Map();
      this.#eventsForJob.set(jobId, eventsForJob);
    }
    return eventsForJob;
  }

  /**
   * Clear data structures supporting a specific job.
   */
  #clearJobData(jobId: string) {
    this.#eventsForJob.delete(jobId);
    this.#jobLocks.delete(jobId);
  }

  /**
   * Ensures a function can only run once it acquires a unique per-job lock, and handles proper lock release after it
   * runs.
   *
   * This primitive allows concurrent writes on this store without risking data corruption due to unsound write
   * interleaving.
   */
  async #withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    let lock = this.#jobLocks.get(jobId);
    if (!lock) {
      lock = new Semaphore(1);
      this.#jobLocks.set(jobId, lock);
    }
    await lock.acquire();
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  /**
   * Returns a string key based on @param contractAddress and @param eventSelector.
   *
   * The returned key is meant to be used when interacting with index #eventsByContractAndEventSelector.
   */
  #keyFor(contractAddress: AztecAddress, eventSelector: EventSelector): string {
    return `${contractAddress.toString()}_${eventSelector.toString()}`;
  }
}
