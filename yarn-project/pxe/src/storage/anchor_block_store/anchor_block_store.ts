import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

/**
 * Holds the block header that PXE's private execution is anchored to. Updated by the BlockSynchronizer as the chain
 * advances or reorgs.
 */
export class AnchorBlockStore {
  logger = createLogger('anchor_block_store');

  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  /**
   * Sets the currently synchronized block header.
   *
   * Important: only called from BlockSynchronizer, and since it must run atomically with other stores in a reorg, it
   * MUST NOT be wrapped in `transactionAsync`: doing so deadlocks when the kv-store backend is IndexedDB (no
   * support for reentrancy).
   */
  async setHeader(header: BlockHeader): Promise<void> {
    this.logger.debug('setHeader', { blockNumber: header.getBlockNumber() });
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    this.logger.debug('getBlockHeader');
    const headerBuffer = await this.#store.transactionAsync(() => this.#synchronizedHeader.getAsync());
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }
    return BlockHeader.fromBuffer(headerBuffer);
  }
}
