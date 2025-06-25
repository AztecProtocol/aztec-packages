import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { DataProvider } from '../data_provider.js';

export class SyncDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockNumber(): Promise<number> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Trying to get block number with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer).globalVariables.blockNumber;
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }

  async getSize(): Promise<number> {
    return (await this.#synchronizedHeader.getAsync())?.length ?? 0;
  }
}
