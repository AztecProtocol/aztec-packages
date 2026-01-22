import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { L2BlockTag } from '../l2_block_source.js';
import { L2TipsStoreBase } from './l2_tips_store_base.js';

/**
 * In-memory implementation of L2 tips store. Useful for testing and lightweight clients.
 * @dev Tests in kv-store/src/stores/l2_tips_memory_store.test.ts
 */
export class L2TipsMemoryStore extends L2TipsStoreBase {
  private readonly tips = new Map<L2BlockTag, BlockNumber>();
  private readonly blockHashes = new Map<number, string>();
  private readonly blockToCheckpoint = new Map<number, CheckpointNumber>();
  private readonly checkpoints = new Map<number, PublishedCheckpoint>();

  protected getTip(tag: L2BlockTag): Promise<BlockNumber | undefined> {
    return Promise.resolve(this.tips.get(tag));
  }

  protected setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void> {
    this.tips.set(tag, blockNumber);
    return Promise.resolve();
  }

  protected getStoredBlockHash(blockNumber: BlockNumber): Promise<string | undefined> {
    return Promise.resolve(this.blockHashes.get(blockNumber));
  }

  protected setBlockHash(blockNumber: BlockNumber, hash: string): Promise<void> {
    this.blockHashes.set(blockNumber, hash);
    return Promise.resolve();
  }

  protected deleteBlockHashesBefore(blockNumber: BlockNumber): Promise<void> {
    for (const key of this.blockHashes.keys()) {
      if (key < blockNumber) {
        this.blockHashes.delete(key);
      }
    }
    return Promise.resolve();
  }

  protected getCheckpointNumberForBlock(blockNumber: BlockNumber): Promise<CheckpointNumber | undefined> {
    return Promise.resolve(this.blockToCheckpoint.get(blockNumber));
  }

  protected setCheckpointNumberForBlock(blockNumber: BlockNumber, checkpointNumber: CheckpointNumber): Promise<void> {
    this.blockToCheckpoint.set(blockNumber, checkpointNumber);
    return Promise.resolve();
  }

  protected deleteBlockToCheckpointBefore(blockNumber: BlockNumber): Promise<void> {
    for (const key of this.blockToCheckpoint.keys()) {
      if (key < blockNumber) {
        this.blockToCheckpoint.delete(key);
      }
    }
    return Promise.resolve();
  }

  protected getCheckpoint(checkpointNumber: CheckpointNumber): Promise<PublishedCheckpoint | undefined> {
    return Promise.resolve(this.checkpoints.get(checkpointNumber));
  }

  protected saveCheckpointData(checkpoint: PublishedCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpoint.number, checkpoint);
    return Promise.resolve();
  }

  protected deleteCheckpointsBefore(checkpointNumber: CheckpointNumber): Promise<void> {
    for (const key of this.checkpoints.keys()) {
      if (key < checkpointNumber) {
        this.checkpoints.delete(key);
      }
    }
    return Promise.resolve();
  }

  protected runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // Memory store doesn't need transactions - just execute immediately
    return fn();
  }
}
