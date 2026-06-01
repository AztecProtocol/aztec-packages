import { BlockNumber } from '@aztec/foundation/branded-types';
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

  describe('header storage', () => {
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
      expect(store.isCanonical({ number: BlockNumber(10), hash: '0xaa' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(10), hash: '0xbb' })).toBe(false);
      expect(store.isCanonical({ number: BlockNumber(11), hash: '0xaa' })).toBe(false);
    });

    it('setManyCanonical records a batch', async () => {
      await store.setManyCanonical([
        { number: BlockNumber(1), hash: '0x1' },
        { number: BlockNumber(2), hash: '0x2' },
      ]);
      expect(store.isCanonical({ number: BlockNumber(1), hash: '0x1' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(2), hash: '0x2' })).toBe(true);
    });

    it('clearAbove retracts entries strictly above the given height', async () => {
      await store.setManyCanonical([
        { number: BlockNumber(5), hash: '0x5' },
        { number: BlockNumber(6), hash: '0x6' },
        { number: BlockNumber(7), hash: '0x7' },
      ]);
      await store.clearAbove(5);
      expect(store.isCanonical({ number: BlockNumber(5), hash: '0x5' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(6), hash: '0x6' })).toBe(false);
      expect(store.isCanonical({ number: BlockNumber(7), hash: '0x7' })).toBe(false);
    });
  });

  describe('finality floor', () => {
    it('treats any block strictly below the floor as canonical regardless of hash', async () => {
      await store.setFloor(100);
      expect(store.isCanonical({ number: BlockNumber(99), hash: '0xanything' })).toBe(true);
      expect(store.isCanonical({ number: BlockNumber(100), hash: '0xmissing' })).toBe(false);
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
      expect(reopened.isCanonical({ number: BlockNumber(130), hash: '0x130' })).toBe(true);
      expect(reopened.isCanonical({ number: BlockNumber(99), hash: '0xx' })).toBe(true);
    });

    it('reports emptiness for a fresh store and non-emptiness once a hash is recorded', async () => {
      expect(store.isEmpty()).toBe(true);
      await store.setCanonical(1, '0x1');
      expect(store.isEmpty()).toBe(false);
    });

    it('tipHeight returns the highest recorded height (0 when empty)', async () => {
      expect(store.tipHeight()).toBe(0);
      await store.setManyCanonical([
        { number: BlockNumber(7), hash: '0x7' },
        { number: BlockNumber(9), hash: '0x9' },
      ]);
      expect(store.tipHeight()).toBe(9);
    });
  });
});
