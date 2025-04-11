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
  logIndexInTx: number;
  txIndexInBlock: number;
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
  /**
   * Map from txHash_logIndexInTx to boolean indicating if log has been seen.
   * @dev A single transaction can have multiple logs.
   */
  #seenLogs: AztecAsyncMap<string, boolean>;

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
   * @param logIndexInTx - The index of the log within the transaction.
   * @param txIndexInBlock - The index of the transaction in which the log was emitted in the block.
   * @param blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    eventSelector: EventSelector,
    msgContent: Fr[],
    txHash: TxHash,
    logIndexInTx: number,
    txIndexInBlock: number,
    blockNumber: number,
  ): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}_${eventSelector.toString()}`;

      // We identify a unique log by its transaction hash and index within that transaction
      const txKey = `${txHash.toString()}_${logIndexInTx}`;

      // Check if this exact log has already been stored
      const hasBeenSeen = await this.#seenLogs.getAsync(txKey);
      if (hasBeenSeen) {
        this.logger.verbose('Ignoring duplicate event log', { txHash: txHash.toString(), logIndexInTx });
        return;
      }

      this.logger.verbose('storing private event log', { contractAddress, recipient, msgContent, blockNumber });

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({
        msgContent: serializeToBuffer(msgContent),
        blockNumber,
        logIndexInTx,
        txIndexInBlock,
      });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);

      // Mark this log as seen
      await this.#seenLogs.set(txKey, true);
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
    const events: Array<{ msgContent: Fr[]; blockNumber: number; logIndexInTx: number; txIndexInBlock: number }> = [];

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
          logIndexInTx: entry.logIndexInTx,
          txIndexInBlock: entry.txIndexInBlock,
        });
      }
    }

    // Sort by block number first, then by txIndexInBlock, then by logIndexInTx
    events.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      if (a.txIndexInBlock !== b.txIndexInBlock) {
        return a.txIndexInBlock - b.txIndexInBlock;
      }
      return a.logIndexInTx - b.logIndexInTx;
    });

    return events.map(e => e.msgContent);
  }

  getSize(): Promise<number> {
    return this.#eventLogs.lengthAsync();
  }
}
