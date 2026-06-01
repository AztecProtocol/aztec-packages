import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

/**
 * Holds PXE's execution anchor block header — the block that private execution is anchored to. This is the synced tip
 * header used to build transactions, kept separate from the canonical-chain state in `CanonicalBlockStore`.
 */
export class AnchorHeaderStore {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = store.openSingleton('header');
  }

  /**
   * Sets the currently synchronized block header.
   *
   * Important: only called from BlockSynchronizer, and since it must run atomically with other stores in a reorg, it
   * MUST NOT be wrapped in `transactionAsync` — doing so deadlocks IndexedDB (no reentrancy).
   */
  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#store.transactionAsync(() => this.#synchronizedHeader.getAsync());
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }
    return BlockHeader.fromBuffer(headerBuffer);
  }
}
