import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

export class SyncDataProvider {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockNumber(): Promise<number | undefined> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      return undefined;
    }

    return Number(BlockHeader.fromBuffer(headerBuffer).globalVariables.blockNumber.toBigInt());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }
}
