import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

export class AnchorBlockDataProvider {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }
}
