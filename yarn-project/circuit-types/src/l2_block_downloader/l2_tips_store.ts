import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

import { type L2BlockTag } from '../l2_block_source.js';
import {
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
} from './l2_block_stream.js';

/** Stores currently synced L2 tips and unfinalized block hashes. */
export class L2TipsStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: AztecMap<L2BlockTag, number>;
  private readonly l2BlockHashesStore: AztecMap<number, string>;

  constructor(store: AztecKVStore) {
    this.l2TipsStore = store.openMap('l2_tips');
    this.l2BlockHashesStore = store.openMap('l2_block_hashes');
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.l2BlockHashesStore.get(number));
  }

  public getL2Tips(): Promise<Record<L2BlockTag, number>> {
    return Promise.resolve({
      latest: this.l2TipsStore.get('latest') ?? 0,
      finalized: this.l2TipsStore.get('finalized') ?? 0,
      proven: this.l2TipsStore.get('proven') ?? 0,
    });
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
