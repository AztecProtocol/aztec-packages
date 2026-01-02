import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { type InTx, TxHash } from '@aztec/stdlib/tx';

import type { JobContext } from '../../job_coordinator/index.js';
import type { StagingDataProvider } from '../../job_coordinator/job_coordinator.js';
import type { PackedPrivateEvent } from '../../pxe.js';

export type PrivateEventDataProviderFilter = {
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
export class PrivateEventDataProvider implements StagingDataProvider {
  readonly storeName = 'private_events';

  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_scope_eventSelector to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /** Map from eventCommitmentIndex to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<number, boolean>;
  /** Staging map for staged data */
  #stagingMap: AztecAsyncMap<string, Buffer>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#seenLogs = this.#store.openMap('seen_logs');
    this.#stagingMap = this.#store.openMap('private_events_staging');
  }

  #keyFor(contractAddress: AztecAddress, scope: AztecAddress, eventSelector: EventSelector): string {
    return `${contractAddress.toString()}_${scope.toString()}_${eventSelector.toString()}`;
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
  storePrivateEventLog(
    eventSelector: EventSelector,
    msgContent: Fr[],
    eventCommitmentIndex: number,
    metadata: PrivateEventMetadata,
    context?: JobContext,
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash } = metadata;

    if (context) {
      return this.#storePrivateEventLogStaging(eventSelector, msgContent, eventCommitmentIndex, metadata, context);
    }

    return this.#store.transactionAsync(async () => {
      const key = this.#keyFor(contractAddress, scope, eventSelector);

      // Check if this exact log has already been stored using eventCommitmentIndex as unique identifier
      const hasBeenSeen = await this.#seenLogs.getAsync(eventCommitmentIndex);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, scope, msgContent, l2BlockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({
        msgContent: serializeToBuffer(msgContent),
        l2BlockNumber,
        l2BlockHash: l2BlockHash.toBuffer(),
        eventCommitmentIndex,
        txHash: txHash.toBuffer(),
      });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Mark this log as seen using eventCommitmentIndex
      await this.#seenLogs.set(eventCommitmentIndex, true);
    });
  }

  async #storePrivateEventLogStaging(
    eventSelector: EventSelector,
    msgContent: Fr[],
    eventCommitmentIndex: number,
    metadata: PrivateEventMetadata,
    context: JobContext,
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash } = metadata;
    const key = this.#keyFor(contractAddress, scope, eventSelector);

    // Check if this exact log has already been stored
    const hasBeenSeen = await this.#seenLogs.getAsync(eventCommitmentIndex);
    if (hasBeenSeen) {
      this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
      return;
    }

    // Also check staging for duplicates
    const stagingKey = context.stagingKey(`event:${eventCommitmentIndex}`);
    const stagedEvent = await this.#stagingMap.getAsync(stagingKey);
    if (stagedEvent) {
      this.logger.verbose('Ignoring duplicate staged event log', { txHash: txHash.toString(), eventCommitmentIndex });
      return;
    }

    this.logger.verbose('staging private event log', { contractAddress, scope, msgContent, l2BlockNumber });

    const stagingData = {
      type: 'store_event',
      key,
      eventCommitmentIndex,
      msgContent: serializeToBuffer(msgContent).toString('hex'),
      l2BlockNumber,
      l2BlockHash: l2BlockHash.toBuffer().toString('hex'),
      txHash: txHash.toBuffer().toString('hex'),
    };

    await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(stagingData)));
  }

  /**
   * Returns the private events given search parameters.
   * @param eventSelector - The event selector to filter by.
   * @param filter - Filtering criteria:
   *  contractAddress: The address of the contract to get events from.
   *  fromBlock: The block number to search from (inclusive).
   *  toBlock: The block number to search upto (exclusive).
   *  scope: - The addresses that decrypted the logs.
   * @returns - The event log contents, augmented with metadata about
   *  the transaction and block it the event was included in .
   */
  public async getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventDataProviderFilter,
  ): Promise<PackedPrivateEvent[]> {
    const events: Array<{ eventCommitmentIndex: number; event: PackedPrivateEvent }> = [];

    for (const scope of filter.scopes) {
      const key = this.#keyFor(filter.contractAddress, scope, eventSelector);
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || entry.l2BlockNumber < filter.fromBlock || entry.l2BlockNumber >= filter.toBlock) {
          continue;
        }

        // Convert buffer back to Fr array
        const reader = BufferReader.asReader(entry.msgContent);
        const numFields = entry.msgContent.length / Fr.SIZE_IN_BYTES;
        const msgContent = reader.readArray(numFields, Fr);
        const txHash = TxHash.fromBuffer(entry.txHash);
        const l2BlockHash = L2BlockHash.fromBuffer(entry.l2BlockHash);

        if (filter.txHash && !txHash.equals(filter.txHash)) {
          continue;
        }

        events.push({
          eventCommitmentIndex: entry.eventCommitmentIndex,
          event: {
            packedEvent: msgContent,
            l2BlockNumber: BlockNumber(entry.l2BlockNumber),
            txHash,
            l2BlockHash,
            eventSelector,
          },
        });
      }
    }

    // Sort by eventCommitmentIndex only
    events.sort((a, b) => a.eventCommitmentIndex - b.eventCommitmentIndex);
    return events.map(ev => ev.event);
  }

  // StagingDataProvider implementation

  /**
   * Commits staged data to main storage.
   * @param context - The job context containing the staging prefix
   */
  async commitStaging(context: JobContext): Promise<void> {
    await this.#store.transactionAsync(async () => {
      const stagingPrefix = context.stagingPrefix;
      const allKeys = await toArray(this.#stagingMap.keysAsync());
      const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

      for (const stagingKey of stagingKeys) {
        const buffer = await this.#stagingMap.getAsync(stagingKey);
        if (!buffer) {
          continue;
        }

        const data = JSON.parse(buffer.toString());

        if (data.type === 'store_event') {
          const index = await this.#eventLogs.lengthAsync();
          await this.#eventLogs.push({
            msgContent: Buffer.from(data.msgContent, 'hex'),
            l2BlockNumber: data.l2BlockNumber,
            l2BlockHash: Buffer.from(data.l2BlockHash, 'hex'),
            eventCommitmentIndex: data.eventCommitmentIndex,
            txHash: Buffer.from(data.txHash, 'hex'),
          });

          const existingIndices = (await this.#eventLogIndex.getAsync(data.key)) || [];
          await this.#eventLogIndex.set(data.key, [...existingIndices, index]);

          await this.#seenLogs.set(data.eventCommitmentIndex, true);
        }

        await this.#stagingMap.delete(stagingKey);
      }
    });
  }

  /**
   * Discards staged data without committing.
   * @param stagingPrefix - The prefix used for staging keys
   */
  async discardStaging(stagingPrefix: string): Promise<void> {
    const allKeys = await toArray(this.#stagingMap.keysAsync());
    const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

    await Promise.all(stagingKeys.map(key => this.#stagingMap.delete(key)));
  }
}
