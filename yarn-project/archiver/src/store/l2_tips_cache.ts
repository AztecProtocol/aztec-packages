import type { BlockHash, L2Tips } from '@aztec/stdlib/block';

import type { BlockStore } from './block_store.js';

/**
 * In-memory cache for L2 chain tips (proposed, checkpointed, proven, finalized).
 * Populated from the BlockStore on first access, then kept up-to-date by the ArchiverDataStoreUpdater
 * calling {@link refreshAfter} around every store transaction that mutates block data.
 */
export class L2TipsCache {
  #tipsPromise: Promise<L2Tips> | undefined;

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

  /** Returns the cached L2 tips. Loads from the block store on first call. */
  public getL2Tips(): Promise<L2Tips> {
    return (this.#tipsPromise ??= this.blockStore.getL2TipsData(this.initialBlockHash));
  }

  /**
   * Points the cache at the state the given write will leave behind, before that write commits. Readers that
   * arrive while it is in flight then wait for committed state instead of being served tips from before it —
   * which would otherwise pair stale tips with post-commit reads that go straight to the store. If the write
   * fails the cache keeps the tips it had, since nothing was committed.
   * @param write - The writer transaction whose committed state the cache should reflect.
   * @returns A promise that settles once the reload has run; callers must await it so a failed reload
   * surfaces to the writer instead of becoming an unhandled rejection.
   */
  public refreshAfter(write: Promise<unknown>): Promise<void> {
    const previousTips = this.#tipsPromise;
    this.#tipsPromise = write.then(
      () => this.blockStore.getL2TipsData(this.initialBlockHash),
      () => previousTips ?? this.blockStore.getL2TipsData(this.initialBlockHash),
    );
    return this.#tipsPromise.then(() => {});
  }
}
