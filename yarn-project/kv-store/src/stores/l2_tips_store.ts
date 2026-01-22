import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { type L2BlockTag, L2TipsStoreBase } from '@aztec/stdlib/block';
import { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';

import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/**
 * Persistent implementation of L2 tips store backed by a KV store.
 * Used by nodes that need to persist chain state across restarts.
 */
export class L2TipsKVStore extends L2TipsStoreBase {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, BlockNumber>;
  private readonly l2BlockHashesStore: AztecAsyncMap<BlockNumber, string>;
  private readonly l2BlockNumberToCheckpointNumberStore: AztecAsyncMap<BlockNumber, CheckpointNumber>;
  private readonly l2CheckpointStore: AztecAsyncMap<CheckpointNumber, Buffer>;

  constructor(
    private store: AztecAsyncKVStore,
    namespace: string,
  ) {
    super();
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
    this.l2BlockNumberToCheckpointNumberStore = store.openMap(
      [namespace, 'l2_block_number_to_checkpoint_number'].join('_'),
    );
    this.l2CheckpointStore = store.openMap([namespace, 'l2_checkpoint_store'].join('_'));
  }

  protected getTip(tag: L2BlockTag): Promise<BlockNumber | undefined> {
    return this.l2TipsStore.getAsync(tag);
  }

  protected setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void> {
    return this.l2TipsStore.set(tag, blockNumber);
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

  protected getCheckpointNumberForBlock(blockNumber: BlockNumber): Promise<CheckpointNumber | undefined> {
    return this.l2BlockNumberToCheckpointNumberStore.getAsync(blockNumber);
  }

  protected setCheckpointNumberForBlock(blockNumber: BlockNumber, checkpointNumber: CheckpointNumber): Promise<void> {
    return this.l2BlockNumberToCheckpointNumberStore.set(blockNumber, checkpointNumber);
  }

  protected async deleteBlockToCheckpointBefore(blockNumber: BlockNumber): Promise<void> {
    for await (const key of this.l2BlockNumberToCheckpointNumberStore.keysAsync({ end: blockNumber })) {
      await this.l2BlockNumberToCheckpointNumberStore.delete(key);
    }
  }

  protected async getCheckpoint(checkpointNumber: CheckpointNumber): Promise<PublishedCheckpoint | undefined> {
    const buffer = await this.l2CheckpointStore.getAsync(checkpointNumber);
    if (!buffer) {
      return undefined;
    }
    return PublishedCheckpoint.fromBuffer(buffer);
  }

  protected saveCheckpointData(checkpoint: PublishedCheckpoint): Promise<void> {
    return this.l2CheckpointStore.set(checkpoint.checkpoint.number, checkpoint.toBuffer());
  }

  protected async deleteCheckpointsBefore(checkpointNumber: CheckpointNumber): Promise<void> {
    for await (const key of this.l2CheckpointStore.keysAsync({ end: checkpointNumber })) {
      await this.l2CheckpointStore.delete(key);
    }
  }

  protected runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.store.transactionAsync(fn);
  }
}
