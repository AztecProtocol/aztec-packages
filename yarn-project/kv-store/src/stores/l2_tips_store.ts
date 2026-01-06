import { GENESIS_BLOCK_HEADER_HASH, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type {
  CheckpointId,
  L2BlockId,
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  L2BlockTag,
  L2TipId,
  L2Tips,
} from '@aztec/stdlib/block';
import { type Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';

import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/** Stores currently synced L2 tips and unfinalized block hashes.
 *  TODO (pw/mbps): I feel like this store would benefit from using transactions to ensure atomicy across the different stores.
 */
export class L2TipsKVStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, BlockNumber>;
  private readonly l2BlockHashesStore: AztecAsyncMap<BlockNumber, string>;
  private readonly l2BlockNumberToCheckpointNumberStore: AztecAsyncMap<BlockNumber, CheckpointNumber>;
  private readonly l2CheckpointStore: AztecAsyncMap<CheckpointNumber, Buffer>;

  constructor(store: AztecAsyncKVStore, namespace: string) {
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
    const proposedBlockId = await this.getBlockId('proposed');
    const finalizedBlockId = await this.getBlockId('finalized');
    const provenBlockId = await this.getBlockId('proven');
    const checkpointedBlockId = await this.getBlockId('checkpointed');

    const finalizedCheckpointId = await this.getCheckpointId('finalized');
    const provenCheckpointId = await this.getCheckpointId('proven');
    const checkpointedCheckpointId = await this.getCheckpointId('checkpointed');

    const l2Tips: L2Tips = {
      proposed: proposedBlockId,
      finalized: { block: finalizedBlockId, checkpoint: finalizedCheckpointId },
      proven: { block: provenBlockId, checkpoint: provenCheckpointId },
      checkpointed: { block: checkpointedBlockId, checkpoint: checkpointedCheckpointId },
    };
    return Promise.resolve(l2Tips);
  }

  private async getCheckpointId(tag: L2BlockTag): Promise<CheckpointId> {
    const blockNumber = await this.l2TipsStore.getAsync(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: CheckpointNumber.ZERO, hash: '' };
    }
    const checkpointNumber = await this.l2BlockNumberToCheckpointNumberStore.getAsync(blockNumber);
    if (checkpointNumber === undefined) {
      throw new Error(`Checkpoint number not found for block number ${blockNumber}`);
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

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added': {
        const blocks = event.blocks;
        for (const block of blocks) {
          await this.l2BlockHashesStore.set(block.number, (await block.hash()).toString());
        }
        await this.l2TipsStore.set('proposed', blocks.at(-1)!.number);
        break;
      }
      case 'chain-checkpointed':
        await this.saveCheckpoint(event.checkpoint.checkpoint);
        break;
      case 'chain-pruned':
        await this.saveTag('proposed', event.block);
        break;
      case 'chain-proven':
        await this.saveTag('proven', event.block);
        break;
      case 'chain-finalized':
        await this.saveTag('finalized', event.block);
        for await (const key of this.l2BlockHashesStore.keysAsync({ end: event.block.number })) {
          await this.l2BlockHashesStore.delete(key);
        }
        break;
    }
  }

  private async saveTag(name: L2BlockTag, block: L2BlockId) {
    await this.l2TipsStore.set(name, block.number);
    if (block.hash) {
      await this.l2BlockHashesStore.set(block.number, block.hash);
    }
  }

  private async saveCheckpoint(checkpoint: Checkpoint) {
    await Promise.all([
      ...Array.from({ length: checkpoint.blocks.length }, (_, i) => i).map(async i => {
        const block = checkpoint.blocks[i];
        await this.l2BlockNumberToCheckpointNumberStore.set(block.number, checkpoint.number);
      }),
      this.l2CheckpointStore.set(checkpoint.number, checkpoint.toBuffer()),
    ]);
  }
}
