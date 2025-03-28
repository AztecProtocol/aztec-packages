import type {
  L2BlockId,
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  L2BlockTag,
  L2Tips,
} from '@aztec/stdlib/block';

/** Stores currently synced L2 tips and unfinalized block hashes. */
export class L2TipsMemoryStore implements L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider {
  private readonly l2TipsStore: Map<L2BlockTag, number> = new Map();
  private readonly l2BlockHashesStore: Map<number, string> = new Map();

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
      case 'blocks-added': {
        const blocks = event.blocks.map(b => b.block);
        for (const block of blocks) {
          this.l2BlockHashesStore.set(block.number, (await block.header.hash()).toString());
        }
        this.l2TipsStore.set('latest', blocks.at(-1)!.number);
        break;
      }
      case 'chain-pruned':
        this.saveTag('latest', event.block);
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

  private saveTag(name: L2BlockTag, block: L2BlockId) {
    this.l2TipsStore.set(name, block.number);
    if (block.hash) {
      this.l2BlockHashesStore.set(block.number, block.hash);
    }
  }
}
