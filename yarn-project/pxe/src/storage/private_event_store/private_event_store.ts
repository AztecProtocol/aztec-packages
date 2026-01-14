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
  l2BlockNumber: number;
  l2BlockHash: Buffer;
  txHash: Buffer;
  /** The index of the tx within the block, used for ordering events */
  txIndexInBlock: number;
  /** The index of the event within the tx (based on nullifier position), used for ordering events */
  eventIndexInTx: number;
  /** The lookup key for #eventsByContractScopeSelector, used for cleanup during rollback */
  lookupKey: string;
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
export class PrivateEventStore {
  #store: AztecAsyncKVStore;
  /** Map storing the actual private event log entries, keyed by siloedEventCommitment */
  #eventLogs: AztecAsyncMap<string, PrivateEventEntry>;
  /** Map from contractAddress_scope_eventSelector to siloedEventCommitment[] for efficient lookup */
  #eventsByContractScopeSelector: AztecAsyncMap<string, string[]>;
  /** Map from block number to siloedEventCommitment[] for rollback support */
  #eventsByBlockNumber: AztecAsyncMap<number, string[]>;
  /** Map from siloedEventCommitment to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<string, boolean>;

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
  ): Promise<void> {
    const { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash, txIndexInBlock, eventIndexInTx } = metadata;

    return this.#store.transactionAsync(async () => {
      const key = this.#keyFor(contractAddress, scope, eventSelector);

      // The siloed event commitment is guaranteed to be unique as it's inserted into the nullifier tree. For this
      // reason we use it as id.
      const eventId = siloedEventCommitment.toString();

      const hasBeenSeen = await this.#seenLogs.getAsync(eventId);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), siloedEventCommitment });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, scope, msgContent, l2BlockNumber });

      await this.#eventLogs.set(eventId, {
        randomness,
        msgContent: serializeToBuffer(msgContent),
        l2BlockNumber,
        l2BlockHash: l2BlockHash.toBuffer(),
        txHash: txHash.toBuffer(),
        txIndexInBlock,
        eventIndexInTx,
        lookupKey: key,
      });

      const existingIds = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];
      await this.#eventsByContractScopeSelector.set(key, [...existingIds, eventId]);

      const existingBlockIds = (await this.#eventsByBlockNumber.getAsync(l2BlockNumber)) || [];
      await this.#eventsByBlockNumber.set(l2BlockNumber, [...existingBlockIds, eventId]);

      // Mark this log as seen
      await this.#seenLogs.set(eventId, true);
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
   * @returns - The event log contents, augmented with metadata about the transaction and block in which the event was
   * included.
   */
  public async getPrivateEvents(
    eventSelector: EventSelector,
    filter: PrivateEventStoreFilter,
  ): Promise<PackedPrivateEvent[]> {
    const events: Array<{
      l2BlockNumber: number;
      txIndexInBlock: number;
      eventIndexInTx: number;
      event: PackedPrivateEvent;
    }> = [];

    for (const scope of filter.scopes) {
      const key = this.#keyFor(filter.contractAddress, scope, eventSelector);
      const eventIds = (await this.#eventsByContractScopeSelector.getAsync(key)) || [];

      for (const eventId of eventIds) {
        const entry = await this.#eventLogs.getAsync(eventId);
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
          l2BlockNumber: entry.l2BlockNumber,
          txIndexInBlock: entry.txIndexInBlock,
          eventIndexInTx: entry.eventIndexInTx,
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
  }

  /**
   * Rolls back private events that were stored after a given `blockNumber` and up to `synchedBlockNumber` (the block
   * number up to which PXE managed to sync before the reorg happened).
   *
   * IMPORTANT: This method must be called within a transaction to ensure atomicity.
   */
  public async rollback(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    let removedCount = 0;

    for (let block = blockNumber + 1; block <= synchedBlockNumber; block++) {
      const eventIds = await this.#eventsByBlockNumber.getAsync(block);
      if (eventIds) {
        await this.#eventsByBlockNumber.delete(block);

        for (const eventId of eventIds) {
          const entry = await this.#eventLogs.getAsync(eventId);
          if (!entry) {
            throw new Error(`Event log not found for eventId ${eventId}`);
          }

          await this.#eventLogs.delete(eventId);
          await this.#seenLogs.delete(eventId);

          // Update #eventsByContractScopeSelector using the stored lookupKey
          const existingIds = await this.#eventsByContractScopeSelector.getAsync(entry.lookupKey);
          if (!existingIds || existingIds.length === 0) {
            throw new Error(`No ids found in #eventsByContractScopeSelector for key ${entry.lookupKey}`);
          }
          const filteredIds = existingIds.filter(id => id !== eventId);
          if (filteredIds.length === 0) {
            await this.#eventsByContractScopeSelector.delete(entry.lookupKey);
          } else {
            await this.#eventsByContractScopeSelector.set(entry.lookupKey, filteredIds);
          }

          removedCount++;
        }
      }
    }

    this.logger.verbose(`Rolled back ${removedCount} private events after block ${blockNumber}`);
  }
}
