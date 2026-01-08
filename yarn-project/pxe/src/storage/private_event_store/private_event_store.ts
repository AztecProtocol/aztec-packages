import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { type InTx, TxHash } from '@aztec/stdlib/tx';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { PackedPrivateEvent } from '../../pxe.js';

export type PrivateEventStoreFilter = {
  contractAddress: AztecAddress;
  fromBlock: number;
  toBlock: number;
  scopes: AztecAddress[];
  txHash?: TxHash;
};

type PrivateEventEntry = {
  msgContent: Buffer;
  eventCommitmentIndex: number;
  l2BlockNumber: number;
  l2BlockHash: Buffer;
  txHash: Buffer;
  /** The lookup key for #eventsByContractScopeSelector, used for cleanup during rollback */
  lookupKey: string;
};

type PrivateEventMetadata = InTx & {
  contractAddress: AztecAddress;
  scope: AztecAddress;
};

/**
 * Stores decrypted private event logs.
 */
export class PrivateEventStore implements StagedStore {
  readonly storeName = 'private_events';

  #store: AztecAsyncKVStore;
  /** Map storing the actual private event log entries, keyed by eventCommitmentIndex */
  #eventLogs: AztecAsyncMap<number, PrivateEventEntry>;
  /** Map from contractAddress_scope_eventSelector to eventCommitmentIndex[] for efficient lookup */
  #eventsByContractScopeSelector: AztecAsyncMap<string, number[]>;
  /** Map from block number to eventCommitmentIndex[] for rollback support */
  #eventsByBlockNumber: AztecAsyncMap<number, number[]>;
  /** Map from eventCommitmentIndex to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<number, boolean>;
  /** In-memory staging: jobId -> eventCommitmentIndex -> staged data */
  #stagedEvents: Map<string, Map<number, { entry: PrivateEventEntry; key: string }>>;

  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openMap('private_event_logs');
    this.#eventsByContractScopeSelector = this.#store.openMap('events_by_contract_scope_selector');
    this.#seenLogs = this.#store.openMap('seen_logs');
    this.#eventsByBlockNumber = this.#store.openMap('events_by_block_number');

    this.#stagedEvents = new Map();
  }

  #keyFor(contractAddress: AztecAddress, scope: AztecAddress, eventSelector: EventSelector): string {
    return `${contractAddress.toString()}_${scope.toString()}_${eventSelector.toString()}`;
  }

  #entryToEvent(entry: PrivateEventEntry, eventSelector: EventSelector): PackedPrivateEvent {
    const reader = BufferReader.asReader(entry.msgContent);
    const numFields = entry.msgContent.length / Fr.SIZE_IN_BYTES;
    return {
      packedEvent: reader.readArray(numFields, Fr),
      l2BlockNumber: BlockNumber(entry.l2BlockNumber),
      txHash: TxHash.fromBuffer(entry.txHash),
      l2BlockHash: L2BlockHash.fromBuffer(entry.l2BlockHash),
      eventSelector,
    };
  }

  #entryMatchesFilter(entry: PrivateEventEntry, filter: PrivateEventStoreFilter): boolean {
    return (
      entry.l2BlockNumber >= filter.fromBlock &&
      entry.l2BlockNumber < filter.toBlock &&
      (!filter?.txHash || TxHash.fromBuffer(entry.txHash).equals(filter.txHash))
    );
  }

  /** Checks if an event has been seen (committed or staged) */
  async #hasBeenSeen(eventCommitmentIndex: number, jobId?: string): Promise<boolean> {
    if (jobId) {
      const jobStaging = this.#stagedEvents.get(jobId);
      if (jobStaging?.has(eventCommitmentIndex)) {
        return true;
      }
    }
    return !!(await this.#seenLogs.getAsync(eventCommitmentIndex));
  }

  /**
   * Store a private event log.
   * @param eventSelector - The event selector of the event.
   * @param msgContent - The content of the event.
   * @param eventCommitmentIndex - The index of the event commitment in the nullifier tree.
   * @param metadata
   *  contractAddress - The address of the contract that emitted the event.
   *  scope - The address to which the event is scoped.
   *  txHash - The transaction hash of the event log.
   *  blockNumber - The block number in which the event was emitted.
   * @param jobId - The job ID for staging writes
   */
  async storePrivateEventLog(
    eventSelector: EventSelector,
    msgContent: Fr[],
    eventCommitmentIndex: number,
    metadata: PrivateEventMetadata,
    jobId: string,
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash } = metadata;
    const key = this.#keyFor(contractAddress, scope, eventSelector);

    // Check for duplicates (both committed and staged)
    if (await this.#hasBeenSeen(eventCommitmentIndex, jobId)) {
      this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
      return;
    }

    const entry: PrivateEventEntry = {
      msgContent: serializeToBuffer(msgContent),
      l2BlockNumber,
      l2BlockHash: l2BlockHash.toBuffer(),
      eventCommitmentIndex,
      txHash: txHash.toBuffer(),
      lookupKey: key,
    };

    this.logger.verbose('staging private event log', { contractAddress, scope, msgContent, l2BlockNumber });
    let jobStaging = this.#stagedEvents.get(jobId);
    if (!jobStaging) {
      jobStaging = new Map();
      this.#stagedEvents.set(jobId, jobStaging);
    }
    jobStaging.set(eventCommitmentIndex, { entry, key });
  }

  /**
   * Returns the private events given search parameters.
   *
   * @param eventSelector - The event selector to filter by.
   * @param filter - Filtering criteria:
   *  contractAddress: The address of the contract to get events from.
   *  fromBlock: The block number to search from (inclusive).
   *  toBlock: The block number to search upto (exclusive).
   *  scope: - The addresses that decrypted the logs.
   * @param context - Optional job context to include staged events
   * @returns - The event log contents, augmented with metadata about
   *  the transaction and block it the event was included in .
   */
  public async getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventStoreFilter,
    jobId?: string,
  ): Promise<PackedPrivateEvent[]> {
    const eventsMap = new Map<number, PackedPrivateEvent>();

    // Build set of valid keys for this query
    const validKeys = new Set<string>();
    for (const scope of filter.scopes) {
      validKeys.add(this.#keyFor(filter.contractAddress, scope, eventSelector));
    }

    // Get committed events
    for (const key of validKeys) {
      const eventCommitmentIndices = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];

      for (const eventCommitmentIndex of eventCommitmentIndices) {
        const entry = await this.#eventLogs.getAsync(eventCommitmentIndex);
        if (!entry || !this.#entryMatchesFilter(entry, filter)) {
          continue;
        }
        eventsMap.set(entry.eventCommitmentIndex, this.#entryToEvent(entry, eventSelector));
      }
    }

    // Get staged events if context is provided
    if (jobId) {
      const jobStaging = this.#stagedEvents.get(jobId);
      if (jobStaging) {
        for (const [eventCommitmentIndex, { entry, key }] of jobStaging) {
          if (!validKeys.has(key) || !this.#entryMatchesFilter(entry, filter)) {
            continue;
          }
          eventsMap.set(eventCommitmentIndex, this.#entryToEvent(entry, eventSelector));
        }
      }
    }

    // Sort by eventCommitmentIndex and return
    const sortedEntries = Array.from(eventsMap.entries()).sort((a, b) => a[0] - b[0]);
    return sortedEntries.map(([_, event]) => event);
  }

  /**
   * Commits staged data to main storage.
   * Must be called within a transaction by the JobCoordinator.
   * @param context - The job context identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    const jobStaging = this.#stagedEvents.get(jobId);
    if (!jobStaging) {
      return;
    }

    for (const [eventCommitmentIndex, { entry, key }] of jobStaging) {
      await this.#eventLogs.set(eventCommitmentIndex, entry);

      const existingIndices = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];
      await this.#eventsByContractScopeSelector.set(key, [...existingIndices, eventCommitmentIndex]);

      const existingBlockIndices = (await this.#eventsByBlockNumber.getAsync(entry.l2BlockNumber)) || [];
      await this.#eventsByBlockNumber.set(entry.l2BlockNumber, [...existingBlockIndices, eventCommitmentIndex]);

      await this.#seenLogs.set(eventCommitmentIndex, true);
    }

    this.#stagedEvents.delete(jobId);
  }

  /**
   * Discards staged data without committing.
   * @param context - The job context
   */
  discardStaged(jobId: string): Promise<void> {
    this.#stagedEvents.delete(jobId);
    return Promise.resolve();
  }

  /**
   * Rolls back private events that were stored after a given `blockNumber` and up to `synchedBlockNumber` (the block
   * number up to which PXE managed to sync before the reorg happened).
   */
  public async rollbackEventsAfterBlock(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    await this.#store.transactionAsync(async () => {
      let removedCount = 0;

      for (let block = blockNumber + 1; block <= synchedBlockNumber; block++) {
        const indices = await this.#eventsByBlockNumber.getAsync(block);
        if (indices) {
          await this.#eventsByBlockNumber.delete(block);

          for (const eventCommitmentIndex of indices) {
            const entry = await this.#eventLogs.getAsync(eventCommitmentIndex);
            if (!entry) {
              throw new Error(`Event log not found for eventCommitmentIndex ${eventCommitmentIndex}`);
            }

            await this.#eventLogs.delete(eventCommitmentIndex);
            await this.#seenLogs.delete(eventCommitmentIndex);

            // Update #eventsByContractScopeSelector using the stored lookupKey
            const existingIndices = await this.#eventsByContractScopeSelector.getAsync(entry.lookupKey);
            if (!existingIndices || existingIndices.length === 0) {
              throw new Error(`No indices found in #eventsByContractScopeSelector for key ${entry.lookupKey}`);
            }
            const filteredIndices = existingIndices.filter(idx => idx !== eventCommitmentIndex);
            if (filteredIndices.length === 0) {
              await this.#eventsByContractScopeSelector.delete(entry.lookupKey);
            } else {
              await this.#eventsByContractScopeSelector.set(entry.lookupKey, filteredIndices);
            }

            removedCount++;
          }
        }
      }

      this.logger.verbose(`Rolled back ${removedCount} private events after block ${blockNumber}`);
    });
  }
}
