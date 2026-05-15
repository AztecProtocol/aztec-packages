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

  it('load() repopulates the in-memory map from KV', async () => {
    await chain.set(105, '0xaaa');
    const reopened = new CanonicalChainStore(store);
    await reopened.load();
    await expect(reopened.hashAt(105)).resolves.toEqual('0xaaa');
  });
});
