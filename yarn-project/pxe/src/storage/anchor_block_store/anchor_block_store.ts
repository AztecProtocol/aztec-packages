import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

export class AnchorBlockStore {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  /**
   * Sets the currently synchronized block
   *
   * Important: this method is only called from BlockSynchronizer, and since we need it to run atomically with other
   * stores in the case of a reorg, it MUST NOT be wrapped in a `transactionAsync` call. Doing so would result in a
   * deadlock when the backend is IndexedDB, because `transactionAsync` is not designed to support reentrancy.
   *
   */
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
