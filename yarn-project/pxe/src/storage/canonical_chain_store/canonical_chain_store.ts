import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

export class CanonicalChainStore {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  /** Durable canonical height→hash map. Cold-start cache only; rebuildable from the node. */
  #canonicalHashes: AztecAsyncMap<number, string>;
  /** In-memory copy of the canonical map — the hot read path. Populated by load(). */
  #mem: Map<number, string> = new Map();

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
    this.#canonicalHashes = store.openMap('canonical_chain');
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
    const headerBuffer = await this.#store.transactionAsync(() => this.#synchronizedHeader.getAsync());
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }

  /** Load the in-memory map from KV. Call once at startup before serving reads. */
  async load(): Promise<void> {
    this.#mem.clear();
    for await (const [height, hash] of this.#canonicalHashes.entriesAsync()) {
      this.#mem.set(height, hash);
    }
  }

  /** Record the canonical hash at a height. Writes through to KV and the in-memory map. */
  async set(blockNumber: number, blockHash: string): Promise<void> {
    this.#mem.set(blockNumber, blockHash);
    await this.#canonicalHashes.set(blockNumber, blockHash);
  }

  /** The canonical hash at a height, or undefined if no entry. */
  hashAt(blockNumber: number): Promise<string | undefined> {
    return Promise.resolve(this.#mem.get(blockNumber));
  }

  /** The highest height present in the map (the synchronizer populates contiguously, in order). */
  tipHeight(): Promise<number> {
    let max = -1;
    for (const height of this.#mem.keys()) {
      if (height > max) {
        max = height;
      }
    }
    return Promise.resolve(max);
  }

  /** Retract every entry strictly above `height` (the reorg common-ancestor). */
  async clearAbove(height: number): Promise<void> {
    for (const h of [...this.#mem.keys()]) {
      if (h > height) {
        this.#mem.delete(h);
        await this.#canonicalHashes.delete(h);
      }
    }
  }

  /** Drop every entry strictly below `height` (map-side GC, past finality). */
  async pruneBelow(height: number): Promise<void> {
    for (const h of [...this.#mem.keys()]) {
      if (h < height) {
        this.#mem.delete(h);
        await this.#canonicalHashes.delete(h);
      }
    }
  }
}
