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
import type { Checkpoint } from '@aztec/stdlib/checkpoint';

import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncSingleton } from '../interfaces/singleton.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/** Stores currently synced L2 tips and unfinalized block hashes.
 *  TODO (pw/mbps): I feel like this store would benefit from using transactions to ensure atomicy across the different stores.
 */
export class L2TipsKVStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, BlockNumber>;
  private readonly l2BlockHashesStore: AztecAsyncMap<BlockNumber, string>;
  private readonly l2CheckpointNumberStore: AztecAsyncSingleton<CheckpointNumber>;
  private readonly l2CheckpointHashStore: AztecAsyncSingleton<string>;

  constructor(store: AztecAsyncKVStore, namespace: string) {
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
    this.l2CheckpointNumberStore = store.openSingleton([namespace, 'l2_checkpoint_number'].join('_'));
    this.l2CheckpointHashStore = store.openSingleton([namespace, 'l2_checkpoint_hash'].join('_'));
  }

  public getL2BlockHash(number: BlockNumber): Promise<string | undefined> {
    return this.l2BlockHashesStore.getAsync(number);
  }

  public async getL2Tips(): Promise<L2Tips> {
    return {
      proposed: await this.getL2Tip('proposed'),
      checkpointed: await this.getL2Tip('checkpointed'),
      proven: await this.getL2Tip('proven'),
      finalized: await this.getL2Tip('finalized'),
    };
  }

  private async getL2Tip(tag: L2BlockTag): Promise<L2TipId> {
    const blockNumber = await this.l2TipsStore.getAsync(tag);
    if (blockNumber === undefined || blockNumber === INITIAL_L2_BLOCK_NUM - 1) {
      return {
        block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
      };
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
      this.l2CheckpointHashStore.set(checkpoint.hash().toString()),
      this.l2CheckpointNumberStore.set(checkpoint.number),
    ]);
  }

  private async readCheckpoint(): Promise<CheckpointId | undefined> {
    const [hash, checkpointNumber] = await Promise.all([
      this.l2CheckpointHashStore.getAsync(),
      this.l2CheckpointNumberStore.getAsync(),
    ]);
    if (hash === undefined || checkpointNumber === undefined) {
      return undefined;
    }
    return {
      number: checkpointNumber,
      hash: hash,
    };
  }
}
