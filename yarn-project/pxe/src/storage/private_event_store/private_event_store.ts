import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InTx, TxHash } from '@aztec/stdlib/tx';

import type { PackedPrivateEvent } from '../../pxe.js';
import type { Rollbackable } from '../rollbackable.js';
import type { ChangeSetId, StagedStore } from '../staged_write_coordinator.js';
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

/// Alias types for kv map readability
type EventId = string; // the siloedEventCommitment, stringified
type ContractAndSelectorKey = string;
type BlockNum = number;
type StoredEventBuffer = Buffer;

/**
 * Stores decrypted private event logs.
 *
 * Append-only: events are never deleted during normal operation. Reorgs are handled by delete-on-prune, which removes
 * every event originating on a reorg'd block.
 */
export class PrivateEventStore implements StagedStore, Rollbackable {
  readonly storeName: string = 'private_event';

  #store: AztecAsyncKVStore;
  /** Actual private event log entries, keyed by siloedEventCommitment */
  #events: AztecAsyncMap<EventId, StoredEventBuffer>;
  /** Multi-map from contractAddress_eventSelector to siloedEventCommitment for efficient lookup */
  #eventsByContractAndEventSelector: AztecAsyncMultiMap<ContractAndSelectorKey, EventId>;
  /** Multi-map from block number to siloedEventCommitment, for delete-on-prune. */
  #eventsByBlockNumber: AztecAsyncMultiMap<BlockNum, EventId>;

  /** changeSetId => eventId (event siloed nullifier) => StoredPrivateEvent */
  #eventsForChangeSet: Map<ChangeSetId, Map<EventId, StoredPrivateEvent>>;

  /** Per-change-set locks to prevent concurrent writes from affecting each other. */
  #changeSetLocks: Map<ChangeSetId, Semaphore>;

  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#events = this.#store.openMap('private_event_logs');
    this.#eventsByContractAndEventSelector = this.#store.openMultiMap('events_by_contract_selector');
    this.#eventsByBlockNumber = this.#store.openMultiMap('events_by_block_number');

    this.#eventsForChangeSet = new Map();
    this.#changeSetLocks = new Map();
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
    changeSetId: ChangeSetId,
  ) {
    return this.#withChangeSetLock(changeSetId, () =>
      this.#store.transactionAsync(async () => {
        const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash, txIndexInBlock, eventIndexInTx } = metadata;
        const eventId = siloedEventCommitment.toString();

        this.logger.verbose('storing private event log (staged)', {
          eventId,
          contractAddress,
          scope,
          msgContent,
          l2BlockNumber,
        });

        const existing = await this.#readEvent(eventId, changeSetId);

        if (existing) {
          // If we already stored this event, we still want to make sure to track it for the given scope
          existing.addScope(scope.toString());
          this.#writeEvent(eventId, existing, changeSetId);
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
            changeSetId,
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
      const eventBuffers = await allToCompletion([...eventReadPromises.values()]);

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

  /** Returns the ids (siloed event commitments) of all events emitted at the given block number. Used by delete-on-prune. */
  public async eventIdsAtBlock(blockNumber: number): Promise<string[]> {
    const eventIds: string[] = [];
    for await (const eventId of this.#eventsByBlockNumber.getValuesAsync(blockNumber)) {
      eventIds.push(eventId);
    }
    return eventIds;
  }

  /**
   * Rolls the store back to `toBlock`: deletes every event anchored to a block strictly above it, as if nothing past
   * that block height ever happened. Used by the reorg (`chain-pruned`) path to truncate the orphaned tail. Scanning
   * from `toBlock + 1` upward covers everything above the rollback target without needing to know the chain tip.
   *
   * Must be called inside a transaction owned by the caller (it issues no `transactionAsync` of its own, the reorg path
   * wraps it together with the anchor update, and IndexedDB has no nested transactions). Throws if any change set has
   * uncommitted staged writes, since rolling back mid-change-set could later re-introduce events anchored to deleted
   * blocks.
   */
  public async rollbackToBlock(toBlock: number): Promise<void> {
    if (this.#eventsForChangeSet.size > 0) {
      throw new Error('PXE private event store rollback is not allowed while staged writes are pending');
    }
    // Snapshot before mutating so we never delete from the multimap we are iterating.
    const orphaned: { block: number; eventId: string }[] = [];
    for await (const [block, eventId] of this.#eventsByBlockNumber.entriesAsync({ start: toBlock + 1 })) {
      orphaned.push({ block, eventId });
    }
    let removedCount = 0;
    for (const { block, eventId } of orphaned) {
      const buf = await this.#events.getAsync(eventId);
      if (!buf) {
        throw new Error(`Event not found for eventId ${eventId}`);
      }
      const stored = StoredPrivateEvent.fromBuffer(buf);
      await this.#events.delete(eventId);
      await this.#eventsByContractAndEventSelector.deleteValue(
        this.#keyFor(stored.contractAddress, stored.eventSelector),
        eventId,
      );
      await this.#eventsByBlockNumber.deleteValue(block, eventId);
      removedCount++;
    }
    this.logger.verbose('rolled back private events', { removedCount, toBlock });
  }

  /**
   * Commits in-memory staged data to persistent storage.
   *
   * Called by StagedWriteCoordinator when an operation completes successfully.
   *
   * Note: StagedWriteCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync
   * here (and using one would throw on IndexedDB as it does not support nested txs).
   *
   * @param changeSetId - The changeSetId identifying which staged data to commit
   */
  async commitChangeSet(changeSetId: ChangeSetId): Promise<void> {
    // Note: Don't use #withChangeSetLock here - commit runs within StagedWriteCoordinator's transactionAsync,
    // and awaiting the lock would create a microtask boundary with no pending DB request,
    // causing IndexedDB to auto-commit the transaction.
    for (const [eventId, entry] of this.#getEventsForChangeSet(changeSetId).entries()) {
      const lookupKey = this.#keyFor(entry.contractAddress, entry.eventSelector);
      this.logger.verbose('storing private event log', { eventId, lookupKey });

      await allToCompletion([
        this.#events.set(eventId, entry.toBuffer()),
        this.#eventsByContractAndEventSelector.set(lookupKey, eventId),
        this.#eventsByBlockNumber.set(entry.l2BlockNumber, eventId),
      ]);
    }

    this.#clearChangeSetData(changeSetId);
  }

  /**
   * Discards in-memory staged data without persisting it.
   */
  discardChangeSet(changeSetId: ChangeSetId): void {
    this.#clearChangeSetData(changeSetId);
  }

  /**
   * Reads an event from in-memory staged data first, falling back to persistent storage if not found.
   *
   * Returns undefined if the event does not exist in the store overall.
   */
  async #readEvent(eventId: string, changeSetId: ChangeSetId): Promise<StoredPrivateEvent | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const buffer = await this.#events.getAsync(eventId);
    const eventForChangeSet = this.#getEventsForChangeSet(changeSetId).get(eventId);
    return eventForChangeSet ?? (buffer ? StoredPrivateEvent.fromBuffer(buffer) : undefined);
  }

  /**
   * Writes an event to in-memory staged data.
   *
   * Writes are only allowed in a change set context. Events modified while staged will only be persisted when `commit`
   * is called.
   */
  #writeEvent(eventId: string, entry: StoredPrivateEvent, changeSetId: ChangeSetId) {
    this.#getEventsForChangeSet(changeSetId).set(eventId, entry);
  }

  /**
   * Get in-memory data only visible to @param changeSetId
   */
  #getEventsForChangeSet(changeSetId: ChangeSetId): Map<string, StoredPrivateEvent> {
    let eventsForChangeSet = this.#eventsForChangeSet.get(changeSetId);
    if (eventsForChangeSet === undefined) {
      eventsForChangeSet = new Map();
      this.#eventsForChangeSet.set(changeSetId, eventsForChangeSet);
    }
    return eventsForChangeSet;
  }

  /**
   * Clear data structures supporting a specific change set.
   */
  #clearChangeSetData(changeSetId: ChangeSetId) {
    this.#eventsForChangeSet.delete(changeSetId);
    this.#changeSetLocks.delete(changeSetId);
  }

  /**
   * Ensures a function can only run once it acquires a unique per-change-set lock, and handles proper lock release
   * after it runs.
   *
   * This primitive allows concurrent writes on this store without risking data corruption due to unsound write
   * interleaving.
   */
  async #withChangeSetLock<T>(changeSetId: ChangeSetId, fn: () => Promise<T>): Promise<T> {
    let lock = this.#changeSetLocks.get(changeSetId);
    if (!lock) {
      lock = new Semaphore(1);
      this.#changeSetLocks.set(changeSetId, lock);
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
