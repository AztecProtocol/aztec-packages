import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { BlockHash } from '../block_hash.js';
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

  public async getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    if (number === 0) {
      return (await this.getStoredBlockHash(number)) ?? this.initialBlockHash.toString();
    }
    return this.getStoredBlockHash(number);
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.runInTransaction(async () => {
      const [proposedBlockId, finalizedBlockId, provenBlockId, checkpointedBlockId, proposedCheckpointBlockId] =
        await Promise.all([
          this.getBlockId('proposed'),
          this.getBlockId('finalized'),
          this.getBlockId('proven'),
          this.getBlockId('checkpointed'),
          this.getBlockId('proposedCheckpoint'),
        ]);

      const [finalizedCheckpointId, provenCheckpointId, checkpointedCheckpointId, proposedCheckpointId] =
        await Promise.all([
          this.getCheckpointId('finalized'),
          this.getCheckpointId('proven'),
          this.getCheckpointId('checkpointed'),
          this.getCheckpointId('proposedCheckpoint'),
        ]);

      return {
        proposed: proposedBlockId,
        finalized: { block: finalizedBlockId, checkpoint: finalizedCheckpointId },
        proven: { block: provenBlockId, checkpoint: provenCheckpointId },
        checkpointed: { block: checkpointedBlockId, checkpoint: checkpointedCheckpointId },
        proposedCheckpoint: { block: proposedCheckpointBlockId, checkpoint: proposedCheckpointId },
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
    // Prefer the checkpoint id recorded for this cursor when it was last advanced. This lets a cursor
    // resolve correctly even when it legitimately leads the locally-checkpointed frontier (skipped
    // history / startingBlock), where no local block->checkpoint mapping exists.
    const storedCheckpoint = await this.getTipCheckpoint(tag);
    if (storedCheckpoint !== undefined) {
      return storedCheckpoint;
    }
    // Fall back to the block->checkpoint mapping for stores written before per-cursor ids existed.
    const checkpointNumber = await this.getCheckpointNumberForBlock(blockNumber);
    if (checkpointNumber !== undefined) {
      const checkpoint = await this.getCheckpoint(checkpointNumber);
      if (!checkpoint) {
        throw new Error(`Checkpoint not found for checkpoint number ${checkpointNumber}`);
      }
      return { number: checkpointNumber, hash: checkpoint.checkpoint.hash().toString() };
    }
    // A cursor on a real (non-genesis) block with neither a stored id nor a mapping is genuine store
    // corruption. The writers (handleChainCheckpointed/Proven/Finalized/Pruned) always record an id or
    // clamp to genesis, so reaching here means the store was corrupted. Fail loudly rather than silently
    // reporting checkpoint zero, which would drive a checkpoint-replay storm.
    throw new Error(
      `No checkpoint id recorded for ${tag} tip at block ${blockNumber} and no block->checkpoint mapping found; ` +
        `the L2 tips store is corrupted`,
    );
  }

  private genesisCheckpointId(): CheckpointId {
    return { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() };
  }

  /**
   * Resolves the checkpoint id for a block from the local block->checkpoint mapping, or genesis for block
   * 0. Returns undefined when the block is a real block with no local mapping (used by the prune handler
   * to decide whether a clamped cursor can keep the prune target or must fall back to genesis).
   */
  private async resolveCheckpointIdForBlock(blockNumber: BlockNumber): Promise<CheckpointId | undefined> {
    if (blockNumber === 0) {
      return this.genesisCheckpointId();
    }
    const checkpointNumber = await this.getCheckpointNumberForBlock(blockNumber);
    if (checkpointNumber === undefined) {
      return undefined;
    }
    const checkpoint = await this.getCheckpoint(checkpointNumber);
    if (!checkpoint) {
      return undefined;
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
      const checkpointId: CheckpointId = {
        number: event.checkpoint.checkpoint.number,
        hash: event.checkpoint.checkpoint.hash().toString(),
      };
      await this.saveTag('checkpointed', event.block);
      await this.setTipCheckpoint('checkpointed', checkpointId);
      await this.saveCheckpoint(event.checkpoint);
      // proposedCheckpoint is always >= checkpointed. If checkpointed has caught up
      // or surpassed it, advance proposedCheckpoint to match.
      const proposedCheckpointBlock = await this.getBlockId('proposedCheckpoint');
      if (event.block.number > proposedCheckpointBlock.number) {
        await this.saveTag('proposedCheckpoint', event.block);
        await this.setTipCheckpoint('proposedCheckpoint', checkpointId);
      }
    });
  }

  private async handleChainPruned(event: L2BlockStreamEvent): Promise<void> {
    if (event.type !== 'chain-pruned') {
      return;
    }
    await this.runInTransaction(async () => {
      // A prune is a rollback: the proposed tip moves to the prune target unconditionally, but
      // checkpoint-bearing cursors may only move backward. Forward-advancing them onto an
      // uncheckpointed block leaves them on a block with no checkpoint mapping, which getCheckpointId
      // would otherwise resolve to checkpoint zero and drive a replay storm.
      await this.saveTag('proposed', event.block);

      // For each checkpoint-bearing cursor clamped to the prune target, resolve a consistent checkpoint
      // id so the cursor never sits on a real block with no resolvable id (which getCheckpointId would
      // otherwise throw on). When the prune target is a confirmed boundary the node has mapped, derive
      // its id from the local mapping; otherwise the prune target is a synced-but-unmapped block (the
      // skipped-history case), so clamp the cursor to genesis instead — this re-syncs cleanly rather
      // than bricking the read. We never throw here.
      const targetCheckpointId = await this.resolveCheckpointIdForBlock(event.block.number);
      for (const tag of ['checkpointed', 'proposedCheckpoint', 'proven'] as const) {
        const current = await this.getTip(tag);
        if (current !== undefined && current > event.block.number) {
          if (targetCheckpointId !== undefined) {
            await this.saveTag(tag, event.block);
            await this.setTipCheckpoint(tag, targetCheckpointId);
          } else {
            await this.setTip(tag, BlockNumber.ZERO);
            await this.setTipCheckpoint(tag, this.genesisCheckpointId());
          }
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
      const finalizedCheckpointNumber = await this.getCheckpointNumberForBlock(event.block.number);

      // Cap the deletion bound at the lowest live tip. This should always be the finalized tip, but
      // we have hit bugs where this is not the case. Deleting the block hash, block-to-checkpoint mapping,
      // or enclosing checkpoint object for a live tip would dangle subsequent `getBlockId`/`getCheckpointId`
      // lookups and lock the block stream into an error loop.
      const tips = await Promise.all([
        this.getTip('proposed'),
        this.getTip('proposedCheckpoint'),
        this.getTip('checkpointed'),
        this.getTip('proven'),
      ]);
      const liveTipBlocks = tips.filter((t): t is BlockNumber => t !== undefined && t > 0);
      const safeBlockBound = BlockNumber(Math.min(event.block.number, ...liveTipBlocks));
      await this.deleteBlockHashesBefore(safeBlockBound);
      await this.deleteBlockToCheckpointBefore(safeBlockBound);

      if (finalizedCheckpointNumber !== undefined) {
        const tipCheckpoints = await Promise.all(liveTipBlocks.map(b => this.getCheckpointNumberForBlock(b)));
        const safeCheckpointBound = CheckpointNumber(
          Math.min(
            finalizedCheckpointNumber,
            ...tipCheckpoints.filter((c): c is CheckpointNumber => c !== undefined && c > 0),
          ),
        );
        await this.deleteCheckpointsBefore(safeCheckpointBound);
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
