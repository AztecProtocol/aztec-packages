import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { BlockHash } from '../block_hash.js';
import type { L2Block } from '../l2_block.js';
import {
  type CheckpointId,
  GENESIS_CHECKPOINT_HEADER_HASH,
  type L2BlockId,
  type L2BlockTag,
  type LocalL2Tips,
} from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/**
 * Abstract base class for L2 tips stores. Provides common event handling logic
 * while delegating storage operations to subclasses.
 */
export abstract class L2TipsStoreBase implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  constructor(protected readonly initialBlockHash: BlockHash) {}
  // Abstract storage primitives - subclasses implement these based on their backing store

  /** Gets the block number for a given tag. */
  protected abstract getTip(tag: L2BlockTag): Promise<BlockNumber | undefined>;

  /** Sets the block number for a given tag. */
  protected abstract setTip(tag: L2BlockTag, blockNumber: BlockNumber): Promise<void>;

  /** Gets the checkpoint id recorded for a given tag, if any. */
  protected abstract getTipCheckpoint(tag: L2BlockTag): Promise<CheckpointId | undefined>;

  /** Records the checkpoint id for a given tag. */
  protected abstract setTipCheckpoint(tag: L2BlockTag, checkpoint: CheckpointId): Promise<void>;

  /** Gets the block hash for a given block number. */
  protected abstract getStoredBlockHash(blockNumber: BlockNumber): Promise<string | undefined>;

  /** Sets the block hash for a given block number. */
  protected abstract setBlockHash(blockNumber: BlockNumber, hash: string): Promise<void>;

  /** Deletes all block hashes for blocks before the given block number. */
  protected abstract deleteBlockHashesBefore(blockNumber: BlockNumber): Promise<void>;

  /** Runs the given function in a transaction. Memory stores can just execute immediately. */
  protected abstract runInTransaction<T>(fn: () => Promise<T>): Promise<T>;

  // Public interface implementation

  public async getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    if (number === 0) {
      return (await this.getStoredBlockHash(number)) ?? this.initialBlockHash.toString();
    }
    return this.getStoredBlockHash(number);
  }

  public getL2Tips(): Promise<LocalL2Tips> {
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
      return { number: BlockNumber.ZERO, hash: this.initialBlockHash.toString() };
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
      return this.genesisCheckpointId();
    }
    // The checkpoint id recorded for this cursor when it was last advanced is the single source of truth.
    // The writers (handleChainCheckpointed/Proven/Finalized/Pruned) always record an id alongside any
    // non-genesis cursor advance, so a missing id on a real block is genuine store corruption. Fail loudly
    // rather than silently reporting checkpoint zero, which would drive a checkpoint-replay storm.
    const storedCheckpoint = await this.getTipCheckpoint(tag);
    if (storedCheckpoint !== undefined) {
      return storedCheckpoint;
    }
    throw new Error(`No checkpoint id recorded for ${tag} tip at block ${blockNumber}; the L2 tips store is corrupted`);
  }

  private genesisCheckpointId(): CheckpointId {
    return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
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
      const checkpointId: CheckpointId = {
        number: event.checkpoint.checkpoint.number,
        hash: event.checkpoint.checkpoint.hash().toString(),
      };
      await this.saveTag('checkpointed', event.block);
      await this.setTipCheckpoint('checkpointed', checkpointId);
    });
  }

  private async handleChainPruned(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-pruned') {
      return;
    }
    await this.runInTransaction(async () => {
      // A prune is a rollback: the proposed tip moves to the prune target unconditionally, but
      // checkpoint-bearing cursors may only move backward. Forward-advancing them onto an
      // uncheckpointed block leaves them on a block with no recorded checkpoint id, which getCheckpointId
      // would then throw on.
      await this.saveTag('proposed', event.block);

      // Clamp any checkpoint-bearing cursor that leads the source's confirmed checkpointed tip down to
      // that tip. The event always carries a valid (block, id) pair for the checkpointed boundary, so the
      // clamped cursor always resolves to a recorded id.
      for (const tag of ['checkpointed', 'proven'] as const) {
        const current = await this.getTip(tag);
        if (current !== undefined && current > event.checkpointed.block.number) {
          await this.saveTag(tag, event.checkpointed.block);
          await this.setTipCheckpoint(tag, event.checkpointed.checkpoint);
        }
      }
    });
  }

  private async handleChainProven(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-proven') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('proven', event.block);
      await this.setTipCheckpoint('proven', event.checkpoint);
    });
  }

  private async handleChainFinalized(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-finalized') {
      return;
    }
    await this.runInTransaction(async () => {
      await this.saveTag('finalized', event.block);
      await this.setTipCheckpoint('finalized', event.checkpoint);

      // Prune block hashes below the lowest live tip. Cap the deletion bound at the lowest live tip rather
      // than the finalized tip alone: this should always be the finalized tip, but we have hit bugs where
      // this is not the case. Deleting the block hash for a live tip would dangle subsequent `getBlockId`
      // lookups and lock the block stream into an error loop.
      const tips = await Promise.all([this.getTip('proposed'), this.getTip('checkpointed'), this.getTip('proven')]);
      const liveTipBlocks = tips.filter((t): t is BlockNumber => t !== undefined && t > 0);
      const safeBlockBound = BlockNumber(Math.min(event.block.number, ...liveTipBlocks));
      await this.deleteBlockHashesBefore(safeBlockBound);
    });
  }

  private async saveTag(name: L2BlockTag, block: L2BlockId): Promise<void> {
    await this.setTip(name, block.number);
    if (block.hash) {
      await this.setBlockHash(block.number, block.hash);
    }
  }
}
