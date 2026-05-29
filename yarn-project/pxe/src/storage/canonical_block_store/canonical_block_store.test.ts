import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { BlockHeader } from '@aztec/stdlib/tx';

import { CanonicalBlockStore } from './canonical_block_store.js';

describe('CanonicalBlockStore', () => {
  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: CanonicalBlockStore;

  beforeEach(async () => {
    kv = await openTmpStore('canonical-block-store-test');
    store = new CanonicalBlockStore(kv);
    await store.load();
  });

  describe('header passthrough (AnchorBlockStore parity)', () => {
    it('round-trips the synchronized header', async () => {
      const header = BlockHeader.empty();
      await store.setHeader(header);
      expect((await store.getBlockHeader()).toBuffer()).toEqual(header.toBuffer());
    });

    it('throws when reading before a header is set', async () => {
      await expect(store.getBlockHeader()).rejects.toThrow(/not-yet-synchronized/);
    });
  });

  describe('canonicality', () => {
    it('reports a recorded (number,hash) as canonical and a competing hash as not', async () => {
      await store.setCanonical(10, '0xaa');
      expect(store.isCanonical({ blockNumber: 10, blockHash: '0xaa' })).toBe(true);
      expect(store.isCanonical({ blockNumber: 10, blockHash: '0xbb' })).toBe(false);
      expect(store.isCanonical({ blockNumber: 11, blockHash: '0xaa' })).toBe(false);
    });

    it('setManyCanonical records a batch', async () => {
      await store.setManyCanonical([
        { blockNumber: 1, blockHash: '0x1' },
        { blockNumber: 2, blockHash: '0x2' },
      ]);
      expect(store.isCanonical({ blockNumber: 1, blockHash: '0x1' })).toBe(true);
      expect(store.isCanonical({ blockNumber: 2, blockHash: '0x2' })).toBe(true);
    });

    it('clearAbove retracts entries strictly above the given height', async () => {
      await store.setManyCanonical([
        { blockNumber: 5, blockHash: '0x5' },
        { blockNumber: 6, blockHash: '0x6' },
        { blockNumber: 7, blockHash: '0x7' },
      ]);
      await store.clearAbove(5);
      expect(store.isCanonical({ blockNumber: 5, blockHash: '0x5' })).toBe(true);
      expect(store.isCanonical({ blockNumber: 6, blockHash: '0x6' })).toBe(false);
      expect(store.isCanonical({ blockNumber: 7, blockHash: '0x7' })).toBe(false);
    });
  });

  describe('finality floor', () => {
    it('treats any block strictly below the floor as canonical regardless of hash', async () => {
      await store.setFloor(100);
      expect(store.isCanonical({ blockNumber: 99, blockHash: '0xanything' })).toBe(true);
      expect(store.isCanonical({ blockNumber: 100, blockHash: '0xmissing' })).toBe(false);
    });

    it('tracks the highest finalized block', async () => {
      await store.setFinalized(42);
      expect(store.getHighestFinalized()).toBe(42);
    });
  });

  describe('persistence (cold-start cache)', () => {
    it('reloads the map, floor and finalized tracker from KV', async () => {
      await store.setFloor(100);
      await store.setFinalized(120);
      await store.setCanonical(130, '0x130');

      const reopened = new CanonicalBlockStore(kv);
      await reopened.load();

      expect(reopened.getFloor()).toBe(100);
      expect(reopened.getHighestFinalized()).toBe(120);
      expect(reopened.isCanonical({ blockNumber: 130, blockHash: '0x130' })).toBe(true);
      expect(reopened.isCanonical({ blockNumber: 99, blockHash: '0xx' })).toBe(true);
    });

    it('reports emptiness for a fresh store and non-emptiness once a hash is recorded', async () => {
      expect(store.isEmpty()).toBe(true);
      await store.setCanonical(1, '0x1');
      expect(store.isEmpty()).toBe(false);
    });

    it('tipHeight returns the highest recorded height (0 when empty)', async () => {
      expect(store.tipHeight()).toBe(0);
      await store.setManyCanonical([
        { blockNumber: 7, blockHash: '0x7' },
        { blockNumber: 9, blockHash: '0x9' },
      ]);
      expect(store.tipHeight()).toBe(9);
    });
  });
});
