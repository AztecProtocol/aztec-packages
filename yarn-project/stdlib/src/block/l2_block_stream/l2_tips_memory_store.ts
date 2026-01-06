import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { L2BlockNew } from '../l2_block_new.js';
import type { CheckpointId, L2BlockId, L2BlockTag, L2Tips } from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';

/**
 * Stores currently synced L2 tips and unfinalized block hashes.
 * @dev tests in kv-store/src/stores/l2_tips_memory_store.test.ts
 */
export class L2TipsMemoryStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  protected readonly l2TipsStore: Map<L2BlockTag, BlockNumber> = new Map();
  protected readonly l2BlockHashesStore: Map<number, string> = new Map();
  protected readonly l2BlocktoCheckpointStore: Map<BlockNumber, CheckpointNumber> = new Map();
  protected readonly checkpointStore: Map<CheckpointNumber, PublishedCheckpoint> = new Map();

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.l2BlockHashesStore.get(number));
  }

  public getL2Tips(): Promise<L2Tips> {
    const proposedBlockId = this.getBlockId('proposed');
    const finalizedBlockId = this.getBlockId('finalized');
    const provenBlockId = this.getBlockId('proven');
    const checkpointedBlockId = this.getBlockId('checkpointed');

    const finalizedCheckpointId = this.getCheckpointId('finalized');
    const provenCheckpointId = this.getCheckpointId('proven');
    const checkpointedCheckpointId = this.getCheckpointId('checkpointed');

    const l2Tips: L2Tips = {
      proposed: proposedBlockId,
      finalized: { block: finalizedBlockId, checkpoint: finalizedCheckpointId },
      proven: { block: provenBlockId, checkpoint: provenCheckpointId },
      checkpointed: { block: checkpointedBlockId, checkpoint: checkpointedCheckpointId },
    };
    return Promise.resolve(l2Tips);
  }

  private getBlockId(tag: L2BlockTag): L2BlockId {
    const blockNumber = this.l2TipsStore.get(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() };
    }
    const blockHash = this.l2BlockHashesStore.get(blockNumber);
    if (!blockHash) {
      throw new Error(`Block hash not found for block number ${blockNumber}`);
    }

    return { number: blockNumber, hash: blockHash };
  }

  private getCheckpointId(tag: L2BlockTag): CheckpointId {
    const blockNumber = this.l2TipsStore.get(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: CheckpointNumber.ZERO, hash: '' };
    }
    const checkpointNumber = this.l2BlocktoCheckpointStore.get(blockNumber);
    if (checkpointNumber === undefined) {
      throw new Error(`Checkpoint number not found for block number ${blockNumber}`);
    }
    const checkpoint = this.checkpointStore.get(checkpointNumber);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for checkpoint number ${checkpointNumber}`);
    }

    return { number: checkpointNumber, hash: checkpoint.checkpoint.hash().toString() };
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added': {
        const blocks = event.blocks;
        for (const block of blocks) {
          this.l2BlockHashesStore.set(block.number, await this.computeBlockHash(block));
        }
        this.l2TipsStore.set('proposed', blocks.at(-1)!.number);
        break;
      }
      case 'chain-checkpointed':
        const blocks = event.checkpoint.checkpoint.blocks;
        const blockId: L2BlockId = {
          number: blocks.at(-1)!.number,
          hash: await this.computeBlockHash(blocks.at(-1)!),
        };
        this.saveTag('checkpointed', blockId);
        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          this.l2BlocktoCheckpointStore.set(block.number, event.checkpoint.checkpoint.number);
        }
        this.checkpointStore.set(event.checkpoint.checkpoint.number, event.checkpoint);
        break;
      case 'chain-pruned':
        this.saveTag('proposed', event.block);
        break;
      case 'chain-proven':
        this.saveTag('proven', event.block);
        break;
      case 'chain-finalized':
        this.saveTag('finalized', event.block);
        for (const key of this.l2BlockHashesStore.keys()) {
          if (key < event.block.number) {
            this.l2BlockHashesStore.delete(key);
          }
        }
        break;
    }
  }

  protected saveTag(name: L2BlockTag, block: L2BlockId) {
    this.l2TipsStore.set(name, block.number);
    if (block.hash) {
      this.l2BlockHashesStore.set(block.number, block.hash);
    }
  }

  protected computeBlockHash(block: L2BlockNew) {
    return block.hash().then(hash => hash.toString());
  }
}
