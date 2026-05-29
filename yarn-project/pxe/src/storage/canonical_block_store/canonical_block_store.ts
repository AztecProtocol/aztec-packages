import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { CanonicalityCheck, Origin } from '../foundation/index.js';

/**
 * Holds the PXE's view of the canonical L2 chain: the synced tip header (used as the execution anchor block) and a
 * `height -> blockHash` map. Reorgs are applied by writing to this map (`clearAbove`), never by mutating other
 * stores.
 *
 * The map is kept in memory (primary) for synchronous, transaction-safe `isCanonical` lookups, and mirrored to KV as
 * a cold-start cache. Replaces the former `AnchorBlockStore`.
 */
export class CanonicalBlockStore implements CanonicalityCheck {
  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  #canonicalHashes: AztecAsyncMap<number, string>;
  #meta: AztecAsyncSingleton<Buffer>;

  #memHashes: Map<number, string> = new Map();
  #floor = 0;
  #highestFinalized = 0;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = store.openSingleton('header');
    this.#canonicalHashes = store.openMap('canonical_hashes');
    this.#meta = store.openSingleton('canonical_meta');
  }

  /**
   * Load the in-memory map, floor and finalized tracker from KV. Call once at construction time.
   *
   * Not wrapped in transactionAsync because load() runs once at construction, before any concurrent writers exist, so
   * the meta read and map scan need no wrapping transaction. (The kv-store's transactionAsync type rejects an
   * async-iteration callback.)
   */
  async load(): Promise<void> {
    const metaBuffer = await this.#meta.getAsync();
    if (metaBuffer) {
      const reader = BufferReader.asReader(metaBuffer);
      this.#floor = reader.readNumber();
      this.#highestFinalized = reader.readNumber();
    }
    this.#memHashes.clear();
    for await (const [height, hash] of this.#canonicalHashes.entriesAsync()) {
      this.#memHashes.set(height, hash);
    }
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

  /** Record the canonical hash at a height. Not wrapped in its own transaction (callers may wrap a reorg batch). */
  async setCanonical(blockNumber: number, blockHash: string): Promise<void> {
    this.#memHashes.set(blockNumber, blockHash);
    await this.#canonicalHashes.set(blockNumber, blockHash);
  }

  /** Record canonical hashes for a batch of blocks (e.g. cold-start hydration or a run of added blocks). */
  async setManyCanonical(origins: Origin[]): Promise<void> {
    for (const { blockNumber, blockHash } of origins) {
      this.#memHashes.set(blockNumber, blockHash);
    }
    await this.#canonicalHashes.setMany(
      origins.map(({ blockNumber, blockHash }) => ({ key: blockNumber, value: blockHash })),
    );
  }

  /** Retract canonical entries strictly above `blockNumber` (the reorg common ancestor). */
  async clearAbove(blockNumber: number): Promise<void> {
    const toDelete = [...this.#memHashes.keys()].filter(h => h > blockNumber);
    for (const height of toDelete) {
      this.#memHashes.delete(height);
      await this.#canonicalHashes.delete(height);
    }
  }

  /**
   * The canonicality predicate. Synchronous and in-memory: blocks below the floor are immutable-canonical; otherwise
   * the recorded hash must match.
   */
  isCanonical(origin: Origin): boolean {
    if (origin.blockNumber < this.#floor) {
      return true;
    }
    return this.#memHashes.get(origin.blockNumber) === origin.blockHash;
  }

  async setFloor(blockNumber: number): Promise<void> {
    this.#floor = blockNumber;
    await this.#persistMeta();
  }

  getFloor(): number {
    return this.#floor;
  }

  async setFinalized(blockNumber: number): Promise<void> {
    this.#highestFinalized = blockNumber;
    await this.#persistMeta();
  }

  getHighestFinalized(): number {
    return this.#highestFinalized;
  }

  isEmpty(): boolean {
    return this.#memHashes.size === 0;
  }

  tipHeight(): number {
    let max = 0;
    for (const height of this.#memHashes.keys()) {
      if (height > max) {
        max = height;
      }
    }
    return max;
  }

  async #persistMeta(): Promise<void> {
    await this.#meta.set(serializeToBuffer(this.#floor, this.#highestFinalized));
  }
}
