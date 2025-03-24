import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { DataProvider } from '../data_provider.js';

interface PrivateEventEntry {
  logContent: Buffer;
  blockNumber: number;
}

export class PrivateEventDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  /** Array storing the actual private event log entries containing the log content and block number */
  #eventLogs: AztecAsyncArray<PrivateEventEntry>;
  /** Map from contract_address_recipient to array of indices into #eventLogs for efficient lookup */
  #eventLogIndex: AztecAsyncMap<string, number[]>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
  }

  /**
   * Store a private event log in the data provider.
   * @param contractAddress - The address of the contract that emitted the event.
   * @param recipient - The recipient of the event.
   * @param logContent - The content of the event.
   * @param blockNumber - The block number in which the event was emitted.
   */
  storePrivateEventLog(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    logContent: Fr[],
    blockNumber: number,
  ): Promise<void> {
    this.logger.verbose('storing private event log', { contractAddress, recipient, logContent, blockNumber });
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}`;
      const logBuffer = serializeToBuffer(logContent);

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push({ logContent: logBuffer, blockNumber });

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);
    });
  }

  public async getPrivateEvents(
    contractAddress: AztecAddress,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[],
  ): Promise<Fr[][]> {
    const events: Fr[][] = [];

    for (const recipient of recipients) {
      const key = `${contractAddress.toString()}_${recipient.toString()}`;
      const indices = (await this.#eventLogIndex.getAsync(key)) || [];

      for (const index of indices) {
        const entry = await this.#eventLogs.atAsync(index);
        if (!entry || entry.blockNumber < from || entry.blockNumber >= from + numBlocks) {
          continue;
        }

        // Convert buffer back to Fr array
        const reader = BufferReader.asReader(entry.logContent);

        const numFields = entry.logContent.length / Fr.SIZE_IN_BYTES;
        const logContent = reader.readArray(numFields, Fr);

        events.push(logContent);
      }
    }

    return events;
  }

  getSize(): Promise<number> {
    return this.#eventLogs.lengthAsync();
  }
}
