import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { BlockHash } from '../block_hash.js';
import type { CheckpointId, L2BlockTag } from '../l2_block_source.js';
import { L2TipsStoreBase } from './l2_tips_store_base.js';

/**
 * In-memory implementation of L2 tips store. Useful for testing and lightweight clients.
 * @dev Tests in kv-store/src/stores/l2_tips_memory_store.test.ts
 */
export class L2TipsMemoryStore extends L2TipsStoreBase {
  constructor(initialBlockHash: BlockHash) {
    super(initialBlockHash);
  }

  private readonly tips = new Map<L2BlockTag, BlockNumber>();
  private readonly tipCheckpoints = new Map<L2BlockTag, CheckpointId>();
  private readonly blockHashes = new Map<number, string>();

  protected getTip(tag: L2BlockTag): Promise<BlockNumber | undefined> {
    return Promise.resolve(this.tips.get(tag));
  }

  protected setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void> {
    this.tips.set(tag, blockNumber);
    return Promise.resolve();
  }

  protected getTipCheckpoint(tag: L2BlockTag): Promise<CheckpointId | undefined> {
    return Promise.resolve(this.tipCheckpoints.get(tag));
  }

  protected setTipCheckpoint(tag: L2BlockTag, checkpoint: CheckpointId): Promise<void> {
    this.tipCheckpoints.set(tag, checkpoint);
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

  protected runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    // Memory store doesn't need transactions - just execute immediately
    return fn();
  }
}
