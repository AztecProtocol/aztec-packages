import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { AnchorBlockStore } from './anchor_block_store.js';

describe('block header', () => {
  let anchorBlockStore: AnchorBlockStore;

  beforeEach(async () => {
    const store = await openTmpStore('sync_store_test');
    anchorBlockStore = new AnchorBlockStore(store);
  });

  it('stores and retrieves the block header', async () => {
    const header = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

    await anchorBlockStore.setHeader(header);
    await expect(anchorBlockStore.getBlockHeader()).resolves.toEqual(header);
  });

  it('rejects getting header if no block set', async () => {
    await expect(() => anchorBlockStore.getBlockHeader()).rejects.toThrow();
  });
});
