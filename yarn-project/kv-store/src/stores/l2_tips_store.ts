import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type {
  CheckpointId,
  L2BlockId,
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  L2BlockTag,
  L2Tips,
} from '@aztec/stdlib/block';
import { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';

import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/** Maintains and returns the current set of L2 Tips. Maintains stores of block hashes and checkpoints in order to do so.
 */
export class L2TipsKVStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, BlockNumber>;
  private readonly l2BlockHashesStore: AztecAsyncMap<BlockNumber, string>;
  private readonly l2BlockNumberToCheckpointNumberStore: AztecAsyncMap<BlockNumber, CheckpointNumber>;
  private readonly l2CheckpointStore: AztecAsyncMap<CheckpointNumber, Buffer>;

  constructor(
    private store: AztecAsyncKVStore,
    namespace: string,
  ) {
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
    this.l2BlockNumberToCheckpointNumberStore = store.openMap(
      [namespace, 'l2_block_number_to_checkpoint_number'].join('_'),
    );
    this.l2CheckpointStore = store.openMap([namespace, 'l2_checkpoint_store'].join('_'));
  }

  public getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    return this.l2BlockHashesStore.getAsync(number);
  }

  public async getL2Tips(): Promise<L2Tips> {
    return await this.store.transactionAsync(async () => {
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

      const l2Tips: L2Tips = {
        proposed: proposedBlockId,
        finalized: { block: finalizedBlockId, checkpoint: finalizedCheckpointId },
        proven: { block: provenBlockId, checkpoint: provenCheckpointId },
        checkpointed: { block: checkpointedBlockId, checkpoint: checkpointedCheckpointId },
      };
      return Promise.resolve(l2Tips);
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

  private async getCheckpointId(tag: L2BlockTag): Promise<CheckpointId> {
    const blockNumber = await this.l2TipsStore.getAsync(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: CheckpointNumber.ZERO, hash: '' };
    }
    const checkpointNumber = await this.l2BlockNumberToCheckpointNumberStore.getAsync(blockNumber);
    if (checkpointNumber === undefined) {
      // No checkpoint associated with this block yet
      return { number: CheckpointNumber.ZERO, hash: '' };
    }
    const checkpointBuffer = await this.l2CheckpointStore.getAsync(checkpointNumber);
    if (!checkpointBuffer) {
      throw new Error(`Checkpoint not found for checkpoint number ${checkpointNumber}`);
    }

    const checkpoint = PublishedCheckpoint.fromBuffer(checkpointBuffer);

    return { number: checkpointNumber, hash: checkpoint.checkpoint.hash().toString() };
  }

  private async getBlockId(tag: L2BlockTag): Promise<L2BlockId> {
    const blockNumber = await this.l2TipsStore.getAsync(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() };
    }
    const blockHash = await this.l2BlockHashesStore.getAsync(blockNumber);
    if (!blockHash) {
      throw new Error(`Block hash not found for block number ${blockNumber}`);
    }

    return { number: blockNumber, hash: blockHash };
  }

  private async handleBlocksAdded(event: L2BlockStreamEvent) {
    if (event.type !== 'blocks-added') {
      return;
    }
    // Simply add the new block hashes by the block number and update the proposed tip
    await this.store.transactionAsync(async () => {
      const blocks = event.blocks;
      for (const block of blocks) {
        await this.l2BlockHashesStore.set(block.number, (await block.hash()).toString());
      }
      await this.l2TipsStore.set('proposed', blocks.at(-1)!.number);
    });
  }

  private async handleChainCheckpointed(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-checkpointed') {
      return;
    }
    // Update the checkpointed chain tip and save the checkpoint
    await this.store.transactionAsync(async () => {
      await this.saveTag('checkpointed', event.block);
      await this.saveCheckpoint(event.checkpoint);
    });
  }

  private async handleChainPruned(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-pruned') {
      return;
    }
    // Update the proposed and checkpointed tips
    await this.store.transactionAsync(async () => {
      await this.saveTag('proposed', event.block);
      await this.saveTag('checkpointed', event.block);
    });
  }

  private async handleChainProven(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-proven') {
      return;
    }
    // Updtae the proven chain tip
    await this.store.transactionAsync(async () => {
      await this.saveTag('proven', event.block);
    });
  }

  private async handleChainFinalized(event: L2BlockStreamEvent) {
    if (event.type !== 'chain-finalized') {
      return;
    }
    await this.store.transactionAsync(async () => {
      // Update the finalized tip
      await this.saveTag('finalized', event.block);
      // Get the checkpoint number for the finalized block
      const finalizedCheckpointNumber = await this.l2BlockNumberToCheckpointNumberStore.getAsync(event.block.number);
      // Clean up block hashes for blocks earlier than the finalized tip
      for await (const key of this.l2BlockHashesStore.keysAsync({ end: event.block.number })) {
        await this.l2BlockHashesStore.delete(key);
      }
      // Clean up block-to-checkpoint mappings for blocks earlier than the finalized tip
      for await (const key of this.l2BlockNumberToCheckpointNumberStore.keysAsync({ end: event.block.number })) {
        await this.l2BlockNumberToCheckpointNumberStore.delete(key);
      }
      // Clean up checkpoints older than the finalized checkpoint
      if (finalizedCheckpointNumber !== undefined) {
        for await (const key of this.l2CheckpointStore.keysAsync({ end: finalizedCheckpointNumber })) {
          await this.l2CheckpointStore.delete(key);
        }
      }
    });
  }

  private async saveTag(name: L2BlockTag, block: L2BlockId) {
    await this.l2TipsStore.set(name, block.number);
    if (block.hash) {
      await this.l2BlockHashesStore.set(block.number, block.hash);
    }
  }

  private async saveCheckpoint(publishedCheckpoint: PublishedCheckpoint) {
    const checkpoint = publishedCheckpoint.checkpoint;
    const lastBlock = checkpoint.blocks.at(-1)!;
    // Only store the mapping for the last block since tips only point to checkpoint boundaries
    await Promise.all([
      this.l2BlockNumberToCheckpointNumberStore.set(lastBlock.number, checkpoint.number),
      this.l2CheckpointStore.set(checkpoint.number, publishedCheckpoint.toBuffer()),
    ]);
  }
}
