import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { L2Block } from '../l2_block.js';
import {
  type CheckpointId,
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2BlockId,
  type L2BlockTag,
  type L2Tips,
} from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/**
 * Abstract base class for L2 tips stores. Provides common event handling logic
 * while delegating storage operations to subclasses.
 */
export abstract class L2TipsStoreBase implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  // Abstract storage primitives - subclasses implement these based on their backing store

  /** Gets the block number for a given tag. */
  protected abstract getTip(tag: L2BlockTag): Promise<BlockNumber | undefined>;

  /** Sets the block number for a given tag. */
  protected abstract setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void>;

  /** Gets the block hash for a given block number. */
  protected abstract getStoredBlockHash(blockNumber: BlockNumber): Promise<string | undefined>;

  /** Sets the block hash for a given block number. */
  protected abstract setBlockHash(blockNumber: BlockNumber, hash: string): Promise<void>;

  /** Deletes all block hashes for blocks before the given block number. */
  protected abstract deleteBlockHashesBefore(blockNumber: BlockNumber): Promise<void>;

  /** Gets the checkpoint number for a given block number. */
  protected abstract getCheckpointNumberForBlock(blockNumber: BlockNumber): Promise<CheckpointNumber | undefined>;

  /** Sets the checkpoint number for a given block number. */
  protected abstract setCheckpointNumberForBlock(
    blockNumber: BlockNumber,
    checkpointNumber: CheckpointNumber,
  ): Promise<void>;

  /** Deletes all block-to-checkpoint mappings for blocks before the given block number. */
  protected abstract deleteBlockToCheckpointBefore(blockNumber: BlockNumber): Promise<void>;

  /** Gets a checkpoint by its number. */
  protected abstract getCheckpoint(checkpointNumber: CheckpointNumber): Promise<PublishedCheckpoint | undefined>;

  /** Saves a checkpoint. */
  protected abstract saveCheckpointData(checkpoint: PublishedCheckpoint): Promise<void>;

  /** Deletes all checkpoints before the given checkpoint number. */
  protected abstract deleteCheckpointsBefore(checkpointNumber: CheckpointNumber): Promise<void>;

  /** Runs the given function in a transaction. Memory stores can just execute immediately. */
  protected abstract runInTransaction<T>(fn: () => Promise<T>): Promise<T>;

  // Public interface implementation

  public getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    return this.getStoredBlockHash(number);
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.runInTransaction(async () => {
      const [proposedBlockId, finalizedBlockId, provenBlockId, checkpointedBlockId] = await Promise.all([
        this.getBlockId('proposed'),
        this.getBlockId('finalized'),
        this.getBlockId('proven'),
        this.getBlockId('checkpointed'),
      ]);

      const [finalizedCheckpointId, provenCheckpointId, checkpointedCheckpointId] = await Promise.all([
        this.getCheckpointId('finalized'),
        this.getCheckpointId('proven'),
        this.getCheckpointId('checkpointed'),
      ]);

      return {
        proposed: proposedBlockId,
        finalized: { block: finalizedBlockId, checkpoint: finalizedCheckpointId },
        proven: { block: provenBlockId, checkpoint: provenCheckpointId },
        checkpointed: { block: checkpointedBlockId, checkpoint: checkpointedCheckpointId },
      };
    });
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.handleBlocksAdded(event);
        break;
      case 'chain-checkpointed':
        await this.handleChainCheckpointed(event);
        break;
      case 'chain-pruned':
        await this.handleChainPruned(event);
        break;
      case 'chain-proven':
        await this.handleChainProven(event);
        break;
      case 'chain-finalized':
        await this.handleChainFinalized(event);
        break;
    }
  }

  // Protected helper that subclasses can override for block hash computation
  protected computeBlockHash(block: L2Block): Promise<string> {
    return block.hash().then(hash => hash.toString());
  }

  // Private implementation

  private async getBlockId(tag: L2BlockTag): Promise<L2BlockId> {
    const blockNumber = await this.getTip(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() };
    }
    const blockHash = await this.getStoredBlockHash(blockNumber);
    if (!blockHash) {
      throw new Error(`Block hash not found for block number ${blockNumber}`);
    }
    return { number: blockNumber, hash: blockHash };
  }

  private async getCheckpointId(tag: L2BlockTag): Promise<CheckpointId> {
    const blockNumber = await this.getTip(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    const checkpointNumber = await this.getCheckpointNumberForBlock(blockNumber);
    if (checkpointNumber === undefined) {
      // No checkpoint associated with this block yet
      return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
    }
    const checkpoint = await this.getCheckpoint(checkpointNumber);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for checkpoint number ${checkpointNumber}`);
    }
    return { number: checkpointNumber, hash: checkpoint.checkpoint.hash().toString() };
  }

  private async handleBlocksAdded(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'blocks-added') {
      return;
    }
    await this.runInTransaction(async () => {
      const blocks = event.blocks;
      for (const block of blocks) {
        await this.setBlockHash(block.number, await this.computeBlockHash(block));
      }
      await this.setTip('proposed', blocks.at(-1)!.number);
    });
  }

  private async handleChainCheckpointed(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-checkpointed') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('checkpointed', event.block);
      await this.saveCheckpoint(event.checkpoint);
    });
  }

  private async handleChainPruned(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-pruned') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('proposed', event.block);
      await this.saveTag('checkpointed', event.block);
      const storeProven = await this.getBlockId('proven');
      if (storeProven.number > event.block.number) {
        await this.saveTag('proven', event.block);
      }
    });
  }

  private async handleChainProven(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-proven') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('proven', event.block);
    });
  }

  private async handleChainFinalized(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-finalized') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('finalized', event.block);
      const finalizedCheckpointNumber = await this.getCheckpointNumberForBlock(event.block.number);

      await this.deleteBlockHashesBefore(event.block.number);
      await this.deleteBlockToCheckpointBefore(event.block.number);

      if (finalizedCheckpointNumber !== undefined) {
        await this.deleteCheckpointsBefore(finalizedCheckpointNumber);
      }
    });
  }

  private async saveTag(name: L2BlockTag, block: L2BlockId): Promise<void> {
    await this.setTip(name, block.number);
    if (block.hash) {
      await this.setBlockHash(block.number, block.hash);
    }
  }

  private async saveCheckpoint(publishedCheckpoint: PublishedCheckpoint): Promise<void> {
    const checkpoint = publishedCheckpoint.checkpoint;
    const lastBlock = checkpoint.blocks.at(-1)!;
    // Only store the mapping for the last block since tips only point to checkpoint boundaries
    await Promise.all([
      this.setCheckpointNumberForBlock(lastBlock.number, checkpoint.number),
      this.saveCheckpointData(publishedCheckpoint),
    ]);
  }
}
