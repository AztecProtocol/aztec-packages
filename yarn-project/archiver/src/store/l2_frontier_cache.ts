import type { BlockHash, L1SyncPoint, L2Frontier, L2Tips } from '@aztec/stdlib/block';

import type { BlockStore } from './block_store.js';

/**
 * In-memory cache for the L2 frontier: the L2 tips, the leading proposed checkpoint, the latest block and
 * checkpoint headers, the pending-chain validation status, and the L1 block the data reflects. Populated
 * from the BlockStore on first access, then kept up-to-date by the ArchiverDataStoreUpdater. The whole
 * snapshot lives behind a single promise, so a reader can never observe tips from one instant paired with a
 * proposed checkpoint from another.
 * Refresh calls should happen *after* the store transaction that mutates block data has committed,
 * so the cache loads from committed state and is never replaced if the writer aborts.
 */
export class L2FrontierCache {
  #frontierPromise: Promise<L2Frontier> | undefined;
  #l1SyncPoint: L1SyncPoint | undefined;

  /**
   * The genesis block hash is dynamic — derived from the injected initial header, which depends on
   * `genesisTimestamp` and any prefilled state — so it is supplied here rather than read from store.
   * The genesis checkpoint hash, by contrast, is the static protocol constant and is resolved
   * inside the block store.
   */
  constructor(
    private blockStore: BlockStore,
    private readonly initialBlockHash: BlockHash,
  ) {}

  /** Returns the cached L2 frontier. Loads from the block store on first call. */
  public getL2Frontier(): Promise<L2Frontier> {
    return (this.#frontierPromise ??= this.#load());
  }

  /**
   * Returns the L1 block the frontier is anchored to, without loading the snapshot. Cheap enough to poll:
   * it is a plain field read, never an L1 or store call.
   */
  public getL1SyncPoint(): L1SyncPoint | undefined {
    return this.#l1SyncPoint;
  }

  /** Returns the cached L2 tips. */
  public async getL2Tips(): Promise<L2Tips> {
    return (await this.getL2Frontier()).tips;
  }

  /**
   * Moves the frontier's L1 anchor without touching its data. Called at the start of a sync pass, before any
   * of that pass's writes: the writes reflect L1 state up to this block, so the anchor must move ahead of the
   * data and never behind it. A reader that saw data from L1 block N under an anchor of N-1 would price a fee
   * at N-1 while the data already includes a checkpoint that landed at N. Data behind the anchor is harmless,
   * because the overrides plan derived from the snapshot fully describes the parent.
   */
  public setL1SyncPoint(syncPoint: L1SyncPoint): void {
    this.#l1SyncPoint = syncPoint;
    const current = this.#frontierPromise;
    if (current) {
      this.#frontierPromise = current.then(frontier => ({ ...frontier, l1SyncPoint: syncPoint }));
    }
  }

  /** Reloads the L2 frontier from the block store. Should be called after the writer transaction has committed. */
  public async refresh(): Promise<void> {
    this.#frontierPromise = this.#load();
    await this.#frontierPromise;
  }

  async #load(): Promise<L2Frontier> {
    const frontier = await this.blockStore.getL2Frontier(this.initialBlockHash);
    return { ...frontier, l1SyncPoint: this.#l1SyncPoint };
  }
}
