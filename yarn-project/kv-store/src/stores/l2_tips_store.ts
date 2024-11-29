import {
  type L2BlockId,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
  type L2BlockTag,
  type L2Tips,
} from '@aztec/circuit-types';

import { type AztecMap } from '../interfaces/map.js';
import { type AztecKVStore } from '../interfaces/store.js';

/** Stores currently synced L2 tips and unfinalized block hashes. */
export class L2TipsStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecMap<L2BlockTag, number>;
  private readonly l2BlockHashesStore: AztecMap<number, string>;

  constructor(store: AztecKVStore, namespace: string) {
    this.l2TipsStore = store.openMap([namespace, 'l2_tips'].join('_'));
    this.l2BlockHashesStore = store.openMap([namespace, 'l2_block_hashes'].join('_'));
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.l2BlockHashesStore.get(number));
  }

  public getL2Tips(): Promise<L2Tips> {
    return Promise.resolve({
      latest: this.getL2Tip('latest'),
      finalized: this.getL2Tip('finalized'),
      proven: this.getL2Tip('proven'),
    });
  }

  private getL2Tip(tag: L2BlockTag): L2BlockId {
    const blockNumber = this.l2TipsStore.get(tag);
    if (blockNumber === undefined || blockNumber === 0) {
      return { number: 0, hash: undefined };
    }
    const blockHash = this.l2BlockHashesStore.get(blockNumber);
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
        for (const key of this.l2BlockHashesStore.keys({ end: event.blockNumber })) {
          await this.l2BlockHashesStore.delete(key);
        }
        break;
    }
  }
}
