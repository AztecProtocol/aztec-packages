import { Buffer32 } from '@aztec/foundation/buffer';
import { BlockHash, type L2Frontier } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';

import type { BlockStore } from './block_store.js';
import { L2FrontierCache } from './l2_frontier_cache.js';

describe('L2FrontierCache', () => {
  type StoreFrontier = Omit<L2Frontier, 'l1SyncPoint'>;

  let getL2Frontier: jest.Mock<(genesisBlockHash: BlockHash) => Promise<StoreFrontier>>;
  let cache: L2FrontierCache;

  beforeEach(() => {
    getL2Frontier = jest.fn<(genesisBlockHash: BlockHash) => Promise<StoreFrontier>>().mockResolvedValue({
      pendingChainValidationStatus: { valid: true },
    } as StoreFrontier);
    cache = new L2FrontierCache({ getL2Frontier } as unknown as BlockStore, BlockHash.random());
  });

  // The no-op block-stream poll relies on this: once warm, repeated reads must not re-enter the block
  // store. A regression here re-introduces a store read on every poll for fully-synced nodes.
  it('reuses the warm promise across reads and only reloads the store on refresh', async () => {
    await cache.getL2Frontier();
    await cache.getL2Tips();
    expect(getL2Frontier).toHaveBeenCalledTimes(1);

    await cache.refresh();
    await cache.getL2Frontier();
    expect(getL2Frontier).toHaveBeenCalledTimes(2);
  });

  it('attaches the L1 sync point to a warm frontier without re-reading the store', async () => {
    await cache.getL2Frontier();
    expect(getL2Frontier).toHaveBeenCalledTimes(1);

    cache.setL1SyncPoint({ blockNumber: 7n, blockHash: Buffer32.ZERO });

    await expect(cache.getL2Frontier().then(f => f.l1SyncPoint)).resolves.toEqual({
      blockNumber: 7n,
      blockHash: Buffer32.ZERO,
    });
    expect(getL2Frontier).toHaveBeenCalledTimes(1);
  });

  it('attaches a sync point set before the first load', async () => {
    cache.setL1SyncPoint({ blockNumber: 3n, blockHash: Buffer32.ZERO });

    await expect(cache.getL2Frontier().then(f => f.l1SyncPoint?.blockNumber)).resolves.toEqual(3n);
  });

  it('keeps the sync point across a refresh', async () => {
    cache.setL1SyncPoint({ blockNumber: 9n, blockHash: Buffer32.ZERO });
    await cache.getL2Frontier();

    await cache.refresh();

    await expect(cache.getL2Frontier().then(f => f.l1SyncPoint?.blockNumber)).resolves.toEqual(9n);
  });

  it('never hands a reader a frontier whose data is newer than its anchor', async () => {
    // Models one sync pass: the anchor moves to L1 block 2, then the pass's writes land and the cache
    // reloads. A reader must never see the post-pass data under the pre-pass anchor, because a fee priced
    // at block 1 would miss the checkpoint that data already includes.
    cache.setL1SyncPoint({ blockNumber: 1n, blockHash: Buffer32.ZERO });
    getL2Frontier.mockResolvedValue({ pendingChainValidationStatus: { valid: true }, marker: 'before' } as any);
    await cache.getL2Frontier();

    cache.setL1SyncPoint({ blockNumber: 2n, blockHash: Buffer32.ZERO });
    const duringPass = await cache.getL2Frontier();
    // The anchor is already at 2 while the data is still the pre-pass one: stale data under a fresh anchor.
    expect(duringPass.l1SyncPoint?.blockNumber).toEqual(2n);
    expect((duringPass as any).marker).toEqual('before');

    getL2Frontier.mockResolvedValue({ pendingChainValidationStatus: { valid: true }, marker: 'after' } as any);
    await cache.refresh();

    const afterPass = await cache.getL2Frontier();
    expect(afterPass.l1SyncPoint?.blockNumber).toEqual(2n);
    expect((afterPass as any).marker).toEqual('after');
  });

  it('returns a fresh object per update, so a snapshot a reader holds cannot change under it', async () => {
    cache.setL1SyncPoint({ blockNumber: 1n, blockHash: Buffer32.ZERO });
    const first = await cache.getL2Frontier();

    cache.setL1SyncPoint({ blockNumber: 2n, blockHash: Buffer32.ZERO });
    await cache.getL2Frontier();

    expect(first.l1SyncPoint?.blockNumber).toEqual(1n);
  });
});
