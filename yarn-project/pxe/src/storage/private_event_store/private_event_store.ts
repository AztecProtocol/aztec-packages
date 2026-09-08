import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InTx, TxHash } from '@aztec/stdlib/tx';

import type { PackedPrivateEvent } from '../../pxe.js';
import { BaseStagingStore, type ReadonlyDb } from '../base_staging_store.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';
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
export class PrivateEventStore extends BaseStagingStore<PrivateEventStoreChangeSet, PrivateEventStoreDb> {
  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'private_event',
      store,
      buildChangeSet: () => new Map(),
      buildDb: db => ({
        events: db.openMap('private_event_logs'),
        eventsByContractAndEventSelector: db.openMultiMap('events_by_contract_selector'),
        eventsByBlockNumber: db.openMultiMap('events_by_block_number'),
      }),
    });
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
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash, txIndexInBlock, eventIndexInTx } = metadata;
      const eventId = siloedEventCommitment.toString();

      this.logger.verbose('storing private event log (staged)', {
        eventId,
        contractAddress,
        scope,
        msgContent,
        l2BlockNumber,
      });

      const existing = await this.#readEvent(changeSet, db, eventId);

      if (existing) {
        // If we already stored this event, we still want to make sure to track it for the given scope
        existing.addScope(scope.toString());
        changeSet.set(eventId, existing);
      } else {
        changeSet.set(
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
        );
      }
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param eventSelector - The event selector to filter by.
   * @param filter - Filtering criteria:
   *  contractAddress: The address of the contract to get events from.
   *  fromBlock: The block number to search from (inclusive).
   *  toBlock: The block number to search upto (exclusive).
   *  scope: - The addresses that decrypted the logs.
   * @param changeSetId - the change set to read staged data from.
   * @returns - The event log contents, augmented with metadata about the transaction and block in which the event was
   * included.
   */
  public getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventStoreFilter,
    changeSetId: ChangeSetId,
  ): Promise<PackedPrivateEvent[]> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const key = this.#keyFor(filter.contractAddress, eventSelector);
      const targetScopes = new Set(filter.scopes.map(s => s.toString()));

      // Map from eventId to the promise that reads the event.
      // We start reads during iteration to keep DB requests pending and avoid IndexedDB auto-commit.
      const eventReadPromises: Map<EventId, Promise<StoredPrivateEvent | undefined>> = new Map();

      // Committed events indexed by contract address and event selector
      for await (const eventId of db.eventsByContractAndEventSelector.getValuesAsync(key)) {
        eventReadPromises.set(eventId, this.#readEvent(changeSet, db, eventId));
      }

      // Staged events have no row in the committed index yet, so add them here. Skip any the loop above already
      // picked up.
      [...changeSet.entries()]
        .filter(
          ([eventId, stagedEvent]) =>
            !eventReadPromises.has(eventId) &&
            this.#keyFor(stagedEvent.contractAddress, stagedEvent.eventSelector) === key,
        )
        .forEach(([eventId, stagedEvent]) => eventReadPromises.set(eventId, Promise.resolve(stagedEvent)));

      const eventIds = [...eventReadPromises.keys()];
      const storedEvents = await allToCompletion([...eventReadPromises.values()]);

      const events: Array<{
        l2BlockNumber: number;
        txIndexInBlock: number;
        eventIndexInTx: number;
        event: PackedPrivateEvent;
      }> = [];

      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const storedPrivateEvent = storedEvents[i];

        // Defensive, if it happens, there's a problem with how we're handling db.eventsByContractAndEventSelector
        if (!storedPrivateEvent) {
          this.logger.verbose(
            `EventId ${eventId} does not exist in main index but it is referenced from contract event selector index`,
          );
          continue;
        }

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
   * Deletes every event originating on a block strictly above `toBlock`, as if nothing past that block height ever
   * happened, truncating the orphaned tail on a reorg. Scanning from `toBlock + 1` upward covers everything above the
   * rollback target without needing to know the chain tip.
   */
  protected async applyRollback(toBlock: number, db: PrivateEventStoreDb): Promise<void> {
    // Snapshot before mutating so we never delete from the multimap we are iterating.
    const orphaned: { block: BlockNum; eventId: EventId }[] = [];
    for await (const [block, eventId] of db.eventsByBlockNumber.entriesAsync({ start: toBlock + 1 })) {
      orphaned.push({ block, eventId });
    }
    let removedCount = 0;
    for (const { block, eventId } of orphaned) {
      const buf = await db.events.getAsync(eventId);
      if (!buf) {
        throw new Error(`Event not found for eventId ${eventId}`);
      }
      const stored = StoredPrivateEvent.fromBuffer(buf);
      await db.events.delete(eventId);
      await db.eventsByContractAndEventSelector.deleteValue(
        this.#keyFor(stored.contractAddress, stored.eventSelector),
        eventId,
      );
      await db.eventsByBlockNumber.deleteValue(block, eventId);
      removedCount++;
    }
    this.logger.verbose('rolled back private events', { removedCount, toBlock });
  }

  protected async flushChangeSet(changeSet: PrivateEventStoreChangeSet, db: PrivateEventStoreDb): Promise<void> {
    for (const [eventId, entry] of changeSet.entries()) {
      const lookupKey = this.#keyFor(entry.contractAddress, entry.eventSelector);
      this.logger.verbose('storing private event log', { eventId, lookupKey });

      await allToCompletion([
        db.events.set(eventId, entry.toBuffer()),
        db.eventsByContractAndEventSelector.set(lookupKey, eventId),
        db.eventsByBlockNumber.set(entry.l2BlockNumber, eventId),
      ]);
    }
  }

  /**
   * Reads an event from in-memory staged data first, falling back to persistent storage if not found.
   *
   * Returns undefined if the event does not exist in the store overall.
   */
  async #readEvent(
    changeSet: PrivateEventStoreChangeSet,
    db: ReadonlyDb<PrivateEventStoreDb>,
    eventId: EventId,
  ): Promise<StoredPrivateEvent | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const buffer = await db.events.getAsync(eventId);
    const eventForChangeSet = changeSet.get(eventId);
    return eventForChangeSet ?? (buffer ? StoredPrivateEvent.fromBuffer(buffer) : undefined);
  }

  /**
   * Returns a string key based on @param contractAddress and @param eventSelector.
   *
   * The returned key is meant to be used when interacting with the db.eventsByContractAndEventSelector index.
   */
  #keyFor(contractAddress: AztecAddress, eventSelector: EventSelector): ContractAndSelectorKey {
    return `${contractAddress.toString()}_${eventSelector.toString()}`;
  }
}

/** A change set's staged data: the events it has stored, keyed by their siloed event commitment. */
type PrivateEventStoreChangeSet = Map<EventId, StoredPrivateEvent>;

type PrivateEventStoreDb = {
  /** Actual private event log entries, keyed by siloedEventCommitment */
  events: AztecAsyncMap<EventId, StoredEventBuffer>;

  /** Multi-map from contractAddress_eventSelector to siloedEventCommitment for efficient lookup */
  eventsByContractAndEventSelector: AztecAsyncMultiMap<ContractAndSelectorKey, EventId>;

  /** Multi-map from block number to siloedEventCommitment, for delete-on-prune. */
  eventsByBlockNumber: AztecAsyncMultiMap<BlockNum, EventId>;
};
