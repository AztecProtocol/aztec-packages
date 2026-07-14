import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { type BlockHash, type CheckpointId, type L2BlockTag, L2TipsStoreBase } from '@aztec/stdlib/block';

import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/** Serialized form of a per-tip checkpoint id stored in the KV store. */
type StoredCheckpointId = { number: number; hash: string };

/**
 * Persistent implementation of L2 tips store backed by a KV store.
 * Used by nodes that need to persist chain state across restarts.
 */
export class L2TipsKVStore extends L2TipsStoreBase {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, BlockNumber>;
  private readonly l2TipCheckpointsStore: AztecAsyncMap<L2BlockTag, StoredCheckpointId>;
  private readonly l2BlockHashesStore: AztecAsyncMap<BlockNumber, string>;

  constructor(
    private store: AztecAsyncKVStore,
    namespace: string,
    initialBlockHash: BlockHash,
  ) {
    super(initialBlockHash);
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2TipCheckpointsStore = store.openMap([namespace, 'l2_tip_checkpoints'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
  }

  protected getTip(tag: L2BlockTag): Promise<BlockNumber | undefined> {
    return this.l2TipsStore.getAsync(tag);
  }

  protected setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void> {
    return this.l2TipsStore.set(tag, blockNumber);
  }

  protected async getTipCheckpoint(tag: L2BlockTag): Promise<CheckpointId | undefined> {
    const stored = await this.l2TipCheckpointsStore.getAsync(tag);
    if (stored === undefined) {
      return undefined;
    }
    return { number: CheckpointNumber(stored.number), hash: stored.hash };
  }

  protected setTipCheckpoint(tag: L2BlockTag, checkpoint: CheckpointId): Promise<void> {
    return this.l2TipCheckpointsStore.set(tag, { number: checkpoint.number, hash: checkpoint.hash });
  }

  protected getStoredBlockHash(blockNumber: BlockNumber): Promise<string | undefined> {
    return this.l2BlockHashesStore.getAsync(blockNumber);
  }

  protected setBlockHash(blockNumber: BlockNumber, hash: string): Promise<void> {
    return this.l2BlockHashesStore.set(blockNumber, hash);
  }

  protected async deleteBlockHashesBefore(blockNumber: BlockNumber): Promise<void> {
    for await (const key of this.l2BlockHashesStore.keysAsync({ end: blockNumber })) {
      await this.l2BlockHashesStore.delete(key);
    }
  }

  protected runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.store.transactionAsync(fn);
  }
}
