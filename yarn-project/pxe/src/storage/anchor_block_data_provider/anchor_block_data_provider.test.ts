import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { JobContext } from '../../job_coordinator/index.js';
import { AnchorBlockDataProvider } from './anchor_block_data_provider.js';

describe('block header', () => {
  let store: AztecAsyncKVStore;
  let anchorBlockDataProvider: AnchorBlockDataProvider;

  beforeEach(async () => {
    store = await openTmpStore('sync_data_provider_test');
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
  });

  it('stores and retrieves the block header', async () => {
    const header = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(INITIAL_L2_BLOCK_NUM) });

    await anchorBlockDataProvider.setHeader(header);
    await expect(anchorBlockDataProvider.getBlockHeader()).resolves.toEqual(header);
  });

  it('rejects getting header if no block set', async () => {
    await expect(() => anchorBlockDataProvider.getBlockHeader()).rejects.toThrow();
  });

  describe('staging', () => {
    it('writes to staging when context provided', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      // First set a committed header
      await anchorBlockDataProvider.setHeader(committedHeader);

      // Then set a staged header
      await anchorBlockDataProvider.setHeader(stagedHeader, context);

      // Without context, should get committed header
      await expect(anchorBlockDataProvider.getBlockHeader()).resolves.toEqual(committedHeader);

      // With context, should get staged header
      await expect(anchorBlockDataProvider.getBlockHeader(context)).resolves.toEqual(stagedHeader);
    });

    it('commitStaging promotes staged data to main', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      await anchorBlockDataProvider.setHeader(committedHeader);
      await anchorBlockDataProvider.setHeader(stagedHeader, context);
      context.registerWrite(anchorBlockDataProvider.storeName);

      // Commit the staging
      await anchorBlockDataProvider.commitStaging(context);

      // Now without context should get the previously staged header
      await expect(anchorBlockDataProvider.getBlockHeader()).resolves.toEqual(stagedHeader);
    });

    it('discardStaging removes staged data without affecting main', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      await anchorBlockDataProvider.setHeader(committedHeader);
      await anchorBlockDataProvider.setHeader(stagedHeader, context);

      // Discard the staging
      await anchorBlockDataProvider.discardStaging(context.stagingPrefix);

      // Should still get committed header
      await expect(anchorBlockDataProvider.getBlockHeader()).resolves.toEqual(committedHeader);

      // With context should fall back to committed since staging was discarded
      await expect(anchorBlockDataProvider.getBlockHeader(context)).resolves.toEqual(committedHeader);
    });
  });
});
