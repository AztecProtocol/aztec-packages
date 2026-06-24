import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import type { L2Tips } from '@aztec/stdlib/block';

import type { BlockStore } from './block_store.js';

/**
 * In-memory cache for L2 chain tips (proposed, checkpointed, proven, finalized).
 * Populated from the BlockStore on first access, then kept up-to-date by the ArchiverDataStoreUpdater.
 * Refresh calls should happen after the store transaction that mutates block data has committed,
 * so the cache loads from committed state and is never replaced if the writer aborts.
 */
export class L2TipsCache {
  #tipsPromise: Promise<L2Tips> | undefined;

  constructor(private blockStore: BlockStore) {}

  /** Returns the cached L2 tips. Loads from the block store on first call. */
  public getL2Tips(): Promise<L2Tips> {
    return (this.#tipsPromise ??= this.blockStore.getL2TipsData(GENESIS_BLOCK_HEADER_HASH));
  }

  /** Reloads the L2 tips from the block store. Should be called after the writer transaction has committed. */
  public async refresh(): Promise<void> {
    this.#tipsPromise = this.blockStore.getL2TipsData(GENESIS_BLOCK_HEADER_HASH);
    await this.#tipsPromise;
  }
}
