import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { type InTx, TxHash } from '@aztec/stdlib/tx';

import type { PackedPrivateEvent } from '../../pxe.js';

export type PrivateEventStoreFilter = {
  contractAddress: AztecAddress;
  fromBlock: number;
  toBlock: number;
  scopes: AztecAddress[];
  txHash?: TxHash;
};

type PrivateEventEntry = {
  randomness: Fr; // Note that this value is currently not being returned on queries and is therefore temporarily unused
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
export class PrivateEventStore {
  #store: AztecAsyncKVStore;
  /** Map storing the actual private event log entries, keyed by eventCommitmentIndex */
  #eventLogs: AztecAsyncMap<number, PrivateEventEntry>;
  /** Map from contractAddress_scope_eventSelector to eventCommitmentIndex[] for efficient lookup */
  #eventsByContractScopeSelector: AztecAsyncMap<string, number[]>;
  /** Map from block number to eventCommitmentIndex[] for rollback support */
  #eventsByBlockNumber: AztecAsyncMap<number, number[]>;
  /** Map from eventCommitmentIndex to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<number, boolean>;

  logger = createLogger('private_event_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openMap('private_event_logs');
    this.#eventsByContractScopeSelector = this.#store.openMap('events_by_contract_scope_selector');
    this.#seenLogs = this.#store.openMap('seen_logs');
    this.#eventsByBlockNumber = this.#store.openMap('events_by_block_number');
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
   */
  storePrivateEventLog(
    eventSelector: EventSelector,
    randomness: Fr,
    msgContent: Fr[],
    eventCommitmentIndex: number,
    metadata: PrivateEventMetadata,
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash } = metadata;

    return this.#store.transactionAsync(async () => {
      const key = this.#keyFor(contractAddress, scope, eventSelector);

      // Check if this exact log has already been stored using eventCommitmentIndex as unique identifier
      const hasBeenSeen = await this.#seenLogs.getAsync(eventCommitmentIndex);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, scope, msgContent, l2BlockNumber });

      await this.#eventLogs.set(eventCommitmentIndex, {
        randomness,
        msgContent: serializeToBuffer(msgContent),
        l2BlockNumber,
        l2BlockHash: l2BlockHash.toBuffer(),
        eventCommitmentIndex,
        txHash: txHash.toBuffer(),
        lookupKey: key,
      });

      const existingIndices = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];
      await this.#eventsByContractScopeSelector.set(key, [...existingIndices, eventCommitmentIndex]);

      const existingBlockIndices = (await this.#eventsByBlockNumber.getAsync(l2BlockNumber)) || [];
      await this.#eventsByBlockNumber.set(l2BlockNumber, [...existingBlockIndices, eventCommitmentIndex]);

      // Mark this log as seen using eventCommitmentIndex
      await this.#seenLogs.set(eventCommitmentIndex, true);
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
   * @returns - The event log contents, augmented with metadata about
   *  the transaction and block it the event was included in .
   */
  public async getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventStoreFilter,
  ): Promise<PackedPrivateEvent[]> {
    const events: Array<{ eventCommitmentIndex: number; event: PackedPrivateEvent }> = [];

    for (const scope of filter.scopes) {
      const key = this.#keyFor(filter.contractAddress, scope, eventSelector);
      const eventCommitmentIndices = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];

      for (const eventCommitmentIndex of eventCommitmentIndices) {
        const entry = await this.#eventLogs.getAsync(eventCommitmentIndex);
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
