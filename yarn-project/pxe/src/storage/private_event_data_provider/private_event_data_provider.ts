import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { EventSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TxHash } from '@aztec/stdlib/tx';

import type { DataProvider } from '../data_provider.js';

interface PrivateEventEntry {
  msgContent: Buffer;
  blockNumber: number;
  eventCommitmentIndex: number;
}

/**
 * Stores decrypted private event logs.
 */
export class PrivateEventDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_recipient_eventSelector to array of indices into #eventLogs for efficient lookup */
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

  /**
   * Store a private event log.
   * @param contractAddress - The address of the contract that emitted the event.
   * @param recipient - The recipient of the event.
   * @param eventSelector - The event selector of the event.
   * @param msgContent - The content of the event.
   * @param txHash - The transaction hash of the event log.
   * @param eventCommitmentIndex - The index of the event commitment in the nullifier tree.
   * @param blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    eventSelector: EventSelector,
    msgContent: Fr[],
    txHash: TxHash,
    eventCommitmentIndex: number,
    blockNumber: number,
  ): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;

      // Check if this exact log has already been stored using eventCommitmentIndex as unique identifier
      const hasBeenSeen = await this.#seenLogs.getAsync(eventCommitmentIndex);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), eventCommitmentIndex });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, recipient, msgContent, blockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({
        msgContent: serializeToBuffer(msgContent),
        blockNumber,
        eventCommitmentIndex,
      });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Mark this log as seen using eventCommitmentIndex
      await this.#seenLogs.set(eventCommitmentIndex, true);
    });
  }

  /**
   * Returns the private events given search parameters.
   * @param contractAddress - The address of the contract to get events from.
   * @param from - The block number to search from.
   * @param numBlocks - The amount of blocks to search.
   * @param recipients - The addresses that decrypted the logs.
   * @param eventSelector - The event selector to filter by.
   * @returns - The event log contents.
   */
  public async getPrivateEvents(
    contractAddress: AztecAddress,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
    eventSelector: EventSelector,
  ): Promise<Fr[][]> {
    const events: Array<{ msgContent: Fr[]; blockNumber: number; eventCommitmentIndex: number }> = [];

    for (const recipient of recipients) {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || entry.blockNumber < from || entry.blockNumber >= from + numBlocks) {
          continue;
        }

        // Convert buffer back to Fr array
        const reader = BufferReader.asReader(entry.msgContent);
        const numFields = entry.msgContent.length / Fr.SIZE_IN_BYTES;
        const msgContent = reader.readArray(numFields, Fr);

        events.push({
          msgContent,
          blockNumber: entry.blockNumber,
          eventCommitmentIndex: entry.eventCommitmentIndex,
        });
      }
    }

    // Sort by eventCommitmentIndex only
    events.sort((a, b) => a.eventCommitmentIndex - b.eventCommitmentIndex);

    return events.map(e => e.msgContent);
  }

  getSize(): Promise<number> {
    return this.#eventLogs.lengthAsync();
  }
}
