import { promiseWithResolvers } from '@aztec/foundation/promise';
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

    await cache.refreshAfter(Promise.resolve());
    await cache.getL2Tips();
    expect(getL2TipsData).toHaveBeenCalledTimes(2);
  });

  describe('refreshAfter', () => {
    it('serves the post-commit tips to readers that arrive before the write resolves', async () => {
      const staleTips = { proposed: { number: 1 } } as unknown as L2Tips;
      const freshTips = { proposed: { number: 2 } } as unknown as L2Tips;
      const getL2TipsData = jest
        .fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>()
        .mockResolvedValueOnce(staleTips)
        .mockResolvedValue(freshTips);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());
      await cache.getL2Tips();

      const { promise: write, resolve: commit } = promiseWithResolvers<void>();
      const refreshed = cache.refreshAfter(write);
      const readDuringWrite = cache.getL2Tips();
      commit();

      await expect(readDuringWrite).resolves.toBe(freshTips);
      await refreshed;
    });

    it('keeps the previous tips when the write fails', async () => {
      const tips = {} as L2Tips;
      const getL2TipsData = jest.fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>().mockResolvedValue(tips);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());
      await cache.getL2Tips();

      await expect(cache.refreshAfter(Promise.reject(new Error('write aborted')))).resolves.toBeUndefined();
      await expect(cache.getL2Tips()).resolves.toBe(tips);
      expect(getL2TipsData).toHaveBeenCalledTimes(1);
    });

    // Without this the reload failure has no awaiter and surfaces as an unhandled rejection instead.
    it('surfaces a failed post-commit reload to the caller and recovers on the next read', async () => {
      const tips = {} as L2Tips;
      const failure = new Error('store read failed');
      const getL2TipsData = jest
        .fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(tips);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());

      await expect(cache.refreshAfter(Promise.resolve())).rejects.toBe(failure);
      // A transient reload failure must not be served to every subsequent reader: the cache drops the
      // rejected promise and the next read retries from the store.
      await expect(cache.getL2Tips()).resolves.toBe(tips);
    });

    it('recovers from a failed first load', async () => {
      const tips = {} as L2Tips;
      const getL2TipsData = jest
        .fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>()
        .mockRejectedValueOnce(new Error('store read failed'))
        .mockResolvedValue(tips);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());

      await expect(cache.getL2Tips()).rejects.toThrow('store read failed');
      await expect(cache.getL2Tips()).resolves.toBe(tips);
    });

    // Store writes commit in registration order (single LMDB writer queue), so the cache installed by the
    // later registration must win regardless of how the earlier write settles.
    it('ends at the newest state across chained refreshes', async () => {
      const tipsAfterA = { proposed: { number: 1 } } as unknown as L2Tips;
      const tipsAfterB = { proposed: { number: 2 } } as unknown as L2Tips;
      const getL2TipsData = jest
        .fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>()
        .mockResolvedValueOnce(tipsAfterA)
        .mockResolvedValue(tipsAfterB);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());

      const { promise: writeA, resolve: commitA } = promiseWithResolvers<void>();
      const { promise: writeB, resolve: commitB } = promiseWithResolvers<void>();
      const refreshedA = cache.refreshAfter(writeA);
      const refreshedB = cache.refreshAfter(writeB);
      commitA();
      commitB();
      await Promise.all([refreshedA, refreshedB]);

      await expect(cache.getL2Tips()).resolves.toBe(tipsAfterB);
    });

    it('ends at the survivor state when the first of two chained writes fails', async () => {
      const initialTips = { proposed: { number: 0 } } as unknown as L2Tips;
      const tipsAfterB = { proposed: { number: 2 } } as unknown as L2Tips;
      const getL2TipsData = jest
        .fn<(genesisBlockHash: BlockHash) => Promise<L2Tips>>()
        .mockResolvedValueOnce(initialTips)
        .mockResolvedValue(tipsAfterB);
      const cache = new L2TipsCache({ getL2TipsData } as unknown as BlockStore, BlockHash.random());
      await cache.getL2Tips();

      const { promise: writeA, reject: abortA } = promiseWithResolvers<void>();
      const { promise: writeB, resolve: commitB } = promiseWithResolvers<void>();
      const refreshedA = cache.refreshAfter(writeA);
      const refreshedB = cache.refreshAfter(writeB);
      abortA(new Error('write aborted'));
      commitB();
      await Promise.all([refreshedA, refreshedB]);

      await expect(cache.getL2Tips()).resolves.toBe(tipsAfterB);
    });
  });
});
