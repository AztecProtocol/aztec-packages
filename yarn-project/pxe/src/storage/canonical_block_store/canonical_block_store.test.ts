import { BlockNumber } from '@aztec/foundation/branded-types';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L2Tips, L2TipsProvider } from '@aztec/stdlib/block';

import { CanonicalBlockStore } from './canonical_block_store.js';

describe('CanonicalBlockStore', () => {
  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: CanonicalBlockStore;

  // Seeds the finalized floor at 5 when load() is called on a fresh store.
  const l2TipsProvider: Pick<L2TipsProvider, 'getL2Tips'> = {
    getL2Tips: () =>
      Promise.resolve({
        finalized: { block: { number: BlockNumber(5), hash: '' }, checkpoint: { number: 0, hash: '' } },
      } as L2Tips),
  };

  // Seeds the finalized floor at 0, modelling a first-boot PXE with no finalized blocks yet.
  const genesisL2TipsProvider: Pick<L2TipsProvider, 'getL2Tips'> = {
    getL2Tips: () =>
      Promise.resolve({
        finalized: { block: { number: BlockNumber(0), hash: '' }, checkpoint: { number: 0, hash: '' } },
      } as L2Tips),
  };

  beforeEach(async () => {
    kv = await openTmpStore('canonical-block-store-test');
    store = new CanonicalBlockStore(kv, l2TipsProvider);
    await store.load();
  });

  describe('canonicality', () => {
    it('treats blocks at or below the finalized floor as canonical regardless of hash', () => {
      expect(store.isCanonical({ number: BlockNumber(3), hash: 'anything' })).toBe(true);
    });

    it('checks the recorded hash for blocks above the finalized floor', async () => {
      await store.setManyCanonical([{ number: BlockNumber(7), hash: '0xabc' }]);
      expect(store.isCanonical({ number: BlockNumber(7), hash: '0xabc' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(7), hash: '0xdef' })).toBe(false);
    });

    it('reports a recorded (number,hash) as canonical and a competing hash as not', async () => {
      await store.setCanonical(10, '0xaa');
      expect(store.isCanonical({ number: BlockNumber(10), hash: '0xaa' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(10), hash: '0xbb' })).toBe(false);
      expect(store.isCanonical({ number: BlockNumber(11), hash: '0xaa' })).toBe(false);
    });

    it('setManyCanonical records a batch', async () => {
      await store.setManyCanonical([
        { number: BlockNumber(6), hash: '0x6' },
        { number: BlockNumber(7), hash: '0x7' },
      ]);
      expect(store.isCanonical({ number: BlockNumber(6), hash: '0x6' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(7), hash: '0x7' })).toBe(true);
    });
  });

  describe('finality floor', () => {
    it('advanceFinalized prunes hashes at/below the new floor and raises the floor', async () => {
      await store.setManyCanonical([
        { number: BlockNumber(6), hash: '0x6' },
        { number: BlockNumber(7), hash: '0x7' },
      ]);

      await store.advanceFinalized(BlockNumber(6));

      expect(store.getCanonicalHash(BlockNumber(6))).toBeUndefined();
      expect(store.isCanonical({ number: BlockNumber(6), hash: 'whatever' })).toBe(true);
      expect(store.getCanonicalHash(BlockNumber(7))).toBe('0x7');
      expect(store.getFinalizedFloor()).toBe(6);
    });
  });

  describe('reorg retraction', () => {
    it('clearAbove retracts the orphaned suffix', async () => {
      await store.setManyCanonical([
        { number: BlockNumber(7), hash: '0x7' },
        { number: BlockNumber(8), hash: '0x8' },
      ]);
      await store.clearAbove(7);
      expect(store.getCanonicalHash(BlockNumber(8))).toBeUndefined();
      expect(store.isCanonical({ number: BlockNumber(7), hash: '0x7' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(8), hash: '0x8' })).toBe(false);
    });
  });

  describe('genesis cold start', () => {
    it('seeds a zero floor and treats only the genesis height as canonical', async () => {
      const genesisKv = await openTmpStore('canonical-block-store-genesis-test');
      const genesisStore = new CanonicalBlockStore(genesisKv, genesisL2TipsProvider);
      await genesisStore.load();

      expect(genesisStore.getFinalizedFloor()).toBe(0);
      expect(genesisStore.isCanonical({ number: BlockNumber(0), hash: 'anything' })).toBe(true);
      expect(genesisStore.isCanonical({ number: BlockNumber(1), hash: 'x' })).toBe(false);
    });
  });

  describe('persistence (cold-start cache)', () => {
    it('load rehydrates the bounded map and floor across restarts', async () => {
      await store.setManyCanonical([{ number: BlockNumber(7), hash: '0x7' }]);
      await store.advanceFinalized(BlockNumber(6));

      const reopened = new CanonicalBlockStore(kv, l2TipsProvider);
      await reopened.load();

      expect(reopened.getCanonicalHash(BlockNumber(7))).toBe('0x7');
      expect(reopened.getFinalizedFloor()).toBe(6);
      expect(reopened.isCanonical({ number: BlockNumber(5), hash: 'x' })).toBe(true);
    });
  });
});
