import type { BlockNumber } from '@aztec/foundation/branded-types';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { CanonicalityCheck, L2BlockId } from '../foundation/index.js';

/**
 * Holds the PXE's view of the canonical L2 chain: the synced tip header (used as the execution anchor block) and a
 * bounded `height -> blockHash` map covering the reorg-able window `(finalizedFloor, proposed]`. Reorgs are applied by
 * writing to this map (`clearAbove`), never by mutating other stores.
 *
 * Canonicality follows `finalized ⇒ canonical`: a block at or below the finalized floor is canonical regardless of
 * hash (it can no longer be reorged), and a block above the floor is canonical only if its recorded hash matches. The
 * map is kept in memory (primary) for synchronous, transaction-safe `isCanonical` lookups, and mirrored to KV as a
 * cold-start cache. Replaces the former `AnchorBlockStore`.
 */
export class CanonicalBlockStore implements CanonicalityCheck {
  #store: AztecAsyncKVStore;
  #finalizedTipProvider: Pick<L2TipsProvider, 'getL2Tips'>;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  #canonicalHashes: AztecAsyncMap<number, string>;
  #meta: AztecAsyncSingleton<Buffer>;

  #memHashes: Map<number, string> = new Map();
  #finalizedFloor = 0;

  constructor(store: AztecAsyncKVStore, finalizedTipProvider: Pick<L2TipsProvider, 'getL2Tips'>) {
    this.#store = store;
    this.#finalizedTipProvider = finalizedTipProvider;
    this.#synchronizedHeader = store.openSingleton('header');
    this.#canonicalHashes = store.openMap('canonical_hashes');
    this.#meta = store.openSingleton('canonical_meta');
  }

  /**
   * Load the in-memory map and finalized floor from KV. Call once at construction time. On a fresh store (no persisted
   * floor) the floor is seeded from the injected finalized-tip provider.
   *
   * Not wrapped in transactionAsync because load() runs once at construction, before any concurrent writers exist, so
   * the meta read and map scan need no wrapping transaction. (The kv-store's transactionAsync type rejects an
   * async-iteration callback.)
   */
  async load(): Promise<void> {
    const metaBuffer = await this.#meta.getAsync();
    if (metaBuffer) {
      this.#finalizedFloor = BufferReader.asReader(metaBuffer).readNumber();
    } else {
      this.#finalizedFloor = (await this.#finalizedTipProvider.getL2Tips()).finalized.block.number;
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
  async setManyCanonical(origins: L2BlockId[]): Promise<void> {
    for (const { number, hash } of origins) {
      this.#memHashes.set(number, hash);
    }
    await this.#canonicalHashes.setMany(origins.map(({ number, hash }) => ({ key: number, value: hash })));
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
   * The canonicality predicate (`finalized ⇒ canonical`). Synchronous and in-memory ONLY: a recorded height matches
   * iff its hash matches; an unrecorded height is canonical iff it sits at or below the finalized floor (it has been
   * pruned out of the reorg-able window because it can no longer be reorged).
   *
   * Synchronous by design — callers invoke it inside the await-free tail of a KV read transaction, where issuing a DB
   * read would let IndexedDB auto-commit the transaction. Do NOT add awaits or DB reads here.
   */
  isCanonical(id: L2BlockId): boolean {
    const recorded = this.#memHashes.get(id.number);
    return recorded !== undefined ? recorded === id.hash : id.number <= this.#finalizedFloor;
  }

  /** The recorded canonical hash at a height within the reorg-able window, or undefined if not recorded. */
  getCanonicalHash(blockNumber: BlockNumber): string | undefined {
    return this.#memHashes.get(blockNumber);
  }

  /**
   * Prune the now-immutable prefix and raise the finalized floor. Deletes every canonical hash at or below
   * `finalized` (those blocks are canonical by the floor from now on) and persists the new floor.
   *
   * Implemented with raw map/singleton writes rather than its own `transactionAsync`: Task 7's synchronizer wraps this
   * call in an outer transaction together with a row reap, and `transactionAsync` is not reentrant (nesting deadlocks
   * IndexedDB). When called standalone (e.g. unit tests) each raw op auto-commits, which is fine.
   */
  async advanceFinalized(finalized: BlockNumber): Promise<void> {
    const toPrune = [...this.#memHashes.keys()].filter(h => h <= finalized);
    for (const height of toPrune) {
      this.#memHashes.delete(height);
      await this.#canonicalHashes.delete(height);
    }
    this.#finalizedFloor = finalized;
    await this.#meta.set(serializeToBuffer(this.#finalizedFloor));
  }

  getFinalizedFloor(): number {
    return this.#finalizedFloor;
  }
}
