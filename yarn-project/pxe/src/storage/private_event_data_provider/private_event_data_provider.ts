import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { DataProvider } from '../data_provider.js';

export class PrivateEventDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  #eventLogs: AztecAsyncArray<Buffer>;
  #eventLogIndex: AztecAsyncMap<string, number[]>;

  logger = createLogger('private_event_data_provider');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#eventLogs = this.#store.openArray('private_event_logs');
    this.#eventLogIndex = this.#store.openMap('private_event_log_index');
  }

  async storePrivateEventLog(contractAddress: AztecAddress, recipient: AztecAddress, logContent: Fr[]): Promise<void> {
    this.logger.verbose('storing private event log', { contractAddress, recipient, logContent });
    return this.#store.transactionAsync(async () => {
      const key = `${contractAddress.toString()}_${recipient.toString()}`;
      const logBuffer = Buffer.concat(logContent.map(fr => fr.toBuffer()));

      const index = await this.#eventLogs.lengthAsync();
      await this.#eventLogs.push(logBuffer);

      const existingIndices = (await this.#eventLogIndex.getAsync(key)) || [];
      await this.#eventLogIndex.set(key, [...existingIndices, index]);
    });
  }

  async getEventLogs(contractAddress: AztecAddress, recipient: AztecAddress): Promise<Fr[][]> {
    const key = `${contractAddress.toString()}_${recipient.toString()}`;
    const indices = (await this.#eventLogIndex.getAsync(key)) || [];

    const logs = await Promise.all(
      indices.map(async index => {
        const buffer = await this.#eventLogs.atAsync(index);
        if (!buffer) {
          return [];
        }

        // Convert buffer back to Fr array
        const frs: Fr[] = [];
        for (let i = 0; i < buffer.length; i += 32) {
          frs.push(Fr.fromBuffer(buffer.slice(i, i + 32)));
        }
        return frs;
      }),
    );

    return logs;
  }

  async getSize(): Promise<number> {
    return this.#eventLogs.lengthAsync();
  }
}
