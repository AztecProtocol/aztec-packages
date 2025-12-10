import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { type InTx, TxHash } from '@aztec/stdlib/tx';

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
export class PrivateEventDataProvider {
  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_scope_eventSelector to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;
  /** Map from eventCommitmentIndex to boolean indicating if log has been seen. */
  #seenLogs: AztecAsyncMap<number, boolean>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
    this.#seenLogs = this.#store.openMap('seen_logs');
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
}
