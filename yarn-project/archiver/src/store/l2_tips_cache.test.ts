import { BlockHash, type L2Tips } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';

import type { BlockStore } from './block_store.js';
import { L2TipsCache } from './l2_tips_cache.js';

describe('L2TipsCache', () => {
  // The no-op block-stream poll relies on this: once warm, repeated getL2Tips reads must not re-enter the block
  // store. A regression here re-introduces a store read on every poll for fully-synced nodes.
  it('reuses the warm promise across reads and only reloads the store on refresh', async () => {
    const getL2TipsData = jest.fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>().mockResolvedValue({} as L2Tips);
    const blockStore = { getL2TipsData } as unknown as BlockStore;
    const cache = new L2TipsCache(blockStore, BlockHash.random());

    await cache.getL2Tips();
    await cache.getL2Tips();
    expect(getL2TipsData).toHaveBeenCalledTimes(1);

    await cache.refresh();
    await cache.getL2Tips();
    expect(getL2TipsData).toHaveBeenCalledTimes(2);
  });
});
