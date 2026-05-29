import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { CanonicalChainStore } from './canonical_chain_store.js';

describe('block header', () => {
  let canonicalChainStore: CanonicalChainStore;

  beforeEach(async () => {
    const store = await openTmpStore('sync_store_test');
    canonicalChainStore = new CanonicalChainStore(store);
  });

  it('stores and retrieves the block header', async () => {
    const header = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

    await canonicalChainStore.setHeader(header);
    await expect(canonicalChainStore.getBlockHeader()).resolves.toEqual(header);
  });

  it('rejects getting header if no block set', async () => {
    await expect(() => canonicalChainStore.getBlockHeader()).rejects.toThrow();
  });
});

describe('canonical chain map', () => {
  let store: Awaited<ReturnType<typeof openTmpStore>>;
  let chain: CanonicalChainStore;

  beforeEach(async () => {
    store = await openTmpStore('canonical_chain_test');
    chain = new CanonicalChainStore(store);
    await chain.load();
  });

  it('stores and retrieves a hash by height', async () => {
    await chain.set(105, '0xaaa');
    await expect(chain.hashAt(105)).resolves.toEqual('0xaaa');
  });

  it('returns undefined for an unknown height', async () => {
    await expect(chain.hashAt(999)).resolves.toBeUndefined();
  });

  it('tipHeight returns the highest set height', async () => {
    await chain.set(103, '0xa');
    await chain.set(104, '0xb');
    await chain.set(105, '0xc');
    await expect(chain.tipHeight()).resolves.toEqual(105);
  });

  it('setMany records multiple hashes at once', async () => {
    await chain.setMany([
      { blockNumber: 103, blockHash: '0xa' },
      { blockNumber: 104, blockHash: '0xb' },
      { blockNumber: 105, blockHash: '0xc' },
    ]);
    await expect(chain.hashAt(103)).resolves.toEqual('0xa');
    await expect(chain.hashAt(104)).resolves.toEqual('0xb');
    await expect(chain.hashAt(105)).resolves.toEqual('0xc');
  });

  it('setMany writes through to KV (survives a reload)', async () => {
    await chain.setMany([
      { blockNumber: 103, blockHash: '0xa' },
      { blockNumber: 104, blockHash: '0xb' },
    ]);
    const reopened = new CanonicalChainStore(store);
    await reopened.load();
    await expect(reopened.hashAt(103)).resolves.toEqual('0xa');
    await expect(reopened.hashAt(104)).resolves.toEqual('0xb');
  });

  it('load() repopulates the in-memory map from KV', async () => {
    await chain.set(105, '0xaaa');
    const reopened = new CanonicalChainStore(store);
    await reopened.load();
    await expect(reopened.hashAt(105)).resolves.toEqual('0xaaa');
  });

  it('clearAbove removes entries strictly above the given height', async () => {
    await chain.set(103, '0xa');
    await chain.set(104, '0xb');
    await chain.set(105, '0xc');
    await chain.set(106, '0xd');
    await chain.clearAbove(104);
    await expect(chain.hashAt(103)).resolves.toEqual('0xa');
    await expect(chain.hashAt(104)).resolves.toEqual('0xb');
    await expect(chain.hashAt(105)).resolves.toBeUndefined();
    await expect(chain.hashAt(106)).resolves.toBeUndefined();
  });

  it('clearAbove survives a reload (KV is updated, not just memory)', async () => {
    await chain.set(105, '0xc');
    await chain.clearAbove(104);
    const reopened = new CanonicalChainStore(store);
    await reopened.load();
    await expect(reopened.hashAt(105)).resolves.toBeUndefined();
  });

  it('pruneBelow removes entries strictly below the given height', async () => {
    await chain.set(103, '0xa');
    await chain.set(104, '0xb');
    await chain.set(105, '0xc');
    await chain.pruneBelow(104);
    await expect(chain.hashAt(103)).resolves.toBeUndefined();
    await expect(chain.hashAt(104)).resolves.toEqual('0xb');
    await expect(chain.hashAt(105)).resolves.toEqual('0xc');
  });

  it('isCanonical is true only when the origin hash matches the map', async () => {
    await chain.set(105, '0xaaa');
    await expect(chain.isCanonical({ blockNumber: 105, blockHash: '0xaaa' })).resolves.toBe(true);
    await expect(chain.isCanonical({ blockNumber: 105, blockHash: '0xbbb' })).resolves.toBe(false);
  });

  it('isCanonical is false when the height has no entry (unset / retracted)', async () => {
    await expect(chain.isCanonical({ blockNumber: 999, blockHash: '0xaaa' })).resolves.toBe(false);
  });

  it('hydrateFromNode fills the map from node-provided blocks', async () => {
    // Minimal stub of the node's getBlocks: returns blocks 10..12 with deterministic hashes.
    const nodeStub = {
      getBlocks: (from: number, limit: number) =>
        Promise.resolve(
          Array.from({ length: limit }, (_unused, i) => ({
            number: from + i,
            hash: { toString: () => `0xhash${from + i}` },
          })),
        ),
    };

    await chain.hydrateFromNode(nodeStub, 10, 12);

    await expect(chain.hashAt(10)).resolves.toEqual('0xhash10');
    await expect(chain.hashAt(11)).resolves.toEqual('0xhash11');
    await expect(chain.hashAt(12)).resolves.toEqual('0xhash12');
  });
});
