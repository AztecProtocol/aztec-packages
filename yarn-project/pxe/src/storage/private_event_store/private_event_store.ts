import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { type InTx, TxHash } from '@aztec/stdlib/tx';

import type { JobContext } from '../../job_coordinator/index.js';
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
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_scope_eventSelector to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /** Map from eventCommitmentIndex to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<number, boolean>;
  /** In-memory staging: jobId -> eventCommitmentIndex -> staged data. Discarded on crash, committed on job success. */
  #stagedEvents: Map<string, Map<number, { entry: PrivateEventEntry; key: string }>>;

  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#seenLogs = this.#store.openMap('seen_logs');
    this.#stagedEvents = new Map();
  }

  #keyFor(contractAddress: AztecAddress, scope: AztecAddress, eventSelector: EventSelector): string {
    return `${contractAddress.toString()}_${scope.toString()}_${eventSelector.toString()}`;
  }

  /** Converts a PrivateEventEntry to a PackedPrivateEvent */
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

  /** Checks if an event entry matches the filter criteria */
  #entryMatchesFilter(entry: PrivateEventEntry, filter: PrivateEventDataProviderFilter): boolean {
    return (
      entry.l2BlockNumber >= filter.fromBlock &&
      entry.l2BlockNumber < filter.toBlock &&
      (!filter?.txHash || TxHash.fromBuffer(entry.txHash).equals(filter.txHash))
    );
  }

  /** Checks if an event has been seen (committed or staged) */
  async #hasBeenSeen(eventCommitmentIndex: number, context?: JobContext): Promise<boolean> {
    // Check staging first (fast in-memory check)
    if (context) {
      const jobStaging = this.#stagedEvents.get(context.jobId);
      if (jobStaging?.has(eventCommitmentIndex)) {
        return true;
      }
    }
    // Check committed
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
   * @param context - Optional job context for staging writes
   */
  async storePrivateEventLog(
    eventSelector: EventSelector,
    msgContent: Fr[],
    eventCommitmentIndex: number,
    metadata: PrivateEventMetadata,
    context?: JobContext,
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash } = metadata;
    const key = this.#keyFor(contractAddress, scope, eventSelector);

    // Check for duplicates (both committed and staged)
    if (await this.#hasBeenSeen(eventCommitmentIndex, context)) {
      this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
      return;
    }

    const entry: PrivateEventEntry = {
      msgContent: serializeToBuffer(msgContent),
      l2BlockNumber,
      l2BlockHash: l2BlockHash.toBuffer(),
      eventCommitmentIndex,
      txHash: txHash.toBuffer(),
    };

    if (context) {
      this.logger.verbose('staging private event log', { contractAddress, scope, msgContent, l2BlockNumber });
      let jobStaging = this.#stagedEvents.get(context.jobId);
      if (!jobStaging) {
        jobStaging = new Map();
        this.#stagedEvents.set(context.jobId, jobStaging);
      }
      jobStaging.set(eventCommitmentIndex, { entry, key });
    } else {
      this.logger.verbose('storing private event log', { contractAddress, scope, msgContent, l2BlockNumber });

      await this.#store.transactionAsync(async () => {
        const index = await this.#eventLogs.lengthAsync();
        await this.#eventLogs.push(entry);

        const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
        await this.#eventLogIndex.set(key, [...existingIndices, index]);

        await this.#seenLogs.set(eventCommitmentIndex, true);
      });
    }
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
    context?: JobContext,
  ): Promise<PackedPrivateEvent[]> {
    const eventsMap = new Map<number, PackedPrivateEvent>();

    // Build set of valid keys for this query
    const validKeys = new Set<string>();
    for (const scope of filter.scopes) {
      validKeys.add(this.#keyFor(filter.contractAddress, scope, eventSelector));
    }

    // Get committed events
    for (const key of validKeys) {
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || !this.#entryMatchesFilter(entry, filter)) {
          continue;
        }
        eventsMap.set(entry.eventCommitmentIndex, this.#entryToEvent(entry, eventSelector));
      }
    }

    // Get staged events if context is provided
    if (context) {
      const jobStaging = this.#stagedEvents.get(context.jobId);
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

  // StagedStore implementation

  /**
   * Commits staged data to main storage.
   * Must be called within a transaction by the JobCoordinator.
   * @param context - The job context identifying which staged data to commit
   */
  async commitStaged(context: JobContext): Promise<void> {
    const jobStaging = this.#stagedEvents.get(context.jobId);
    if (!jobStaging) {
      return;
    }

    for (const [eventCommitmentIndex, { entry, key }] of jobStaging) {
      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push(entry);

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      await this.#seenLogs.set(eventCommitmentIndex, true);
    }

    this.#stagedEvents.delete(context.jobId);
  }

  /**
   * Discards staged data without committing.
   * @param stagingPrefix - The staging prefix (format: "job_{jobId}:")
   */
  discardStaged(stagingPrefix: string): Promise<void> {
    // Extract jobId from prefix format "job_{jobId}:"
    const jobId = stagingPrefix.slice(4, -1);
    this.#stagedEvents.delete(jobId);
    return Promise.resolve();
  }
}
