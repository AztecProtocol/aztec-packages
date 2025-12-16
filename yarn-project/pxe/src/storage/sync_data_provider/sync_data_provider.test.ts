import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { SyncDataProvider } from './sync_data_provider.js';

describe('block header', () => {
  let syncDataProvider: SyncDataProvider;

  beforeEach(async () => {
    const store = await openTmpStore('sync_data_provider_test');
    syncDataProvider = new SyncDataProvider(store);
  });

  it('stores and retrieves the block header', async () => {
    const header = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

    await syncDataProvider.setHeader(header);
    await expect(syncDataProvider.getBlockHeader()).resolves.toEqual(header);
  });

  it('rejects getting header if no block set', async () => {
    await expect(() => syncDataProvider.getBlockHeader()).rejects.toThrow();
  });
});
