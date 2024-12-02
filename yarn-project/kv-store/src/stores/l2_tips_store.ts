import {
  type L2BlockId,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2BlockTag,
  type L2Tips,
} from '@aztec/circuit-types';

import { type AztecAsyncMap } from '../interfaces/map.js';
import { type AztecAsyncKVStore } from '../interfaces/store.js';

/** Stores currently synced L2 tips and unfinalized block hashes. */
export class L2TipsStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecAsyncMap<L2BlockTag, number>;
  private readonly l2BlockHashesStore: AztecAsyncMap<number, string>;

  constructor(store: AztecAsyncKVStore, namespace: string) {
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return this.l2BlockHashesStore.getAsync(number);
  }

  public async getL2Tips(): Promise<L2Tips> {
    return {
      latest: await this.getL2Tip('latest'),
      finalized: await this.getL2Tip('finalized'),
      proven: await this.getL2Tip('proven'),
    };
  }

  private async getL2Tip(tag: L2BlockTag): Promise<L2BlockId> {
    const blockNumber = await this.l2TipsStore.getAsync(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: 0, hash: undefined };
    }
    const blockHash = await this.l2BlockHashesStore.getAsync(blockNumber);
    if (!blockHash) {
      throw new Error(`Block hash not found for block number ${blockNumber}`);
    }
    return { number: blockNumber, hash: blockHash };
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'blocks-added':
        await this.l2TipsStore.set('latest', event.blocks.at(-1)!.number);
        for (const block of event.blocks) {
          await this.l2BlockHashesStore.set(block.number, block.header.hash().toString());
        }
        break;
      case 'chain-pruned':
        await this.l2TipsStore.set('latest', event.blockNumber);
        break;
      case 'chain-proven':
        await this.l2TipsStore.set('proven', event.blockNumber);
        break;
      case 'chain-finalized':
        await this.l2TipsStore.set('finalized', event.blockNumber);
        for await (const key of this.l2BlockHashesStore.keysAsync({ end: event.blockNumber })) {
          await this.l2BlockHashesStore.delete(key);
        }
        break;
    }
  }
}
