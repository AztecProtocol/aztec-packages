import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { makeBlockHeader } from '@aztec/stdlib/testing';

import { JobContext } from '../../job_coordinator/index.js';
import { AnchorBlockStore } from './anchor_block_store.js';

describe('block header', () => {
  let store: AztecAsyncKVStore;
  let anchorBlockStore: AnchorBlockStore;

  beforeEach(async () => {
    store = await openTmpStore('sync_store_test');
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

  describe('staging', () => {
    it('writes to staging when context provided', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      // First set a committed header
      await anchorBlockStore.setHeader(committedHeader);

      // Then set a staged header
      await anchorBlockStore.setHeader(stagedHeader, context);

      // Without context, should get committed header
      await expect(anchorBlockStore.getBlockHeader()).resolves.toEqual(committedHeader);

      // With context, should get staged header
      await expect(anchorBlockStore.getBlockHeader(context)).resolves.toEqual(stagedHeader);
    });

    it('commit promotes staged data to main', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      await anchorBlockStore.setHeader(committedHeader);
      await anchorBlockStore.setHeader(stagedHeader, context);

      // Commit the staging
      await anchorBlockStore.commit(context);

      // Now without context should get the previously staged header
      await expect(anchorBlockStore.getBlockHeader()).resolves.toEqual(stagedHeader);
    });

    it('discardStaged removes staged data without affecting main', async () => {
      const committedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(1) });
      const stagedHeader = makeBlockHeader(randomInt(1000), { blockNumber: BlockNumber(2) });
      const context = new JobContext('test123', 'test');

      await anchorBlockStore.setHeader(committedHeader);
      await anchorBlockStore.setHeader(stagedHeader, context);

      // Discard the staging
      await anchorBlockStore.discardStaged(context.stagingPrefix);

      // Should still get committed header
      await expect(anchorBlockStore.getBlockHeader()).resolves.toEqual(committedHeader);

      // With context should fall back to committed since staging was discarded
      await expect(anchorBlockStore.getBlockHeader(context)).resolves.toEqual(committedHeader);
    });
  });
});
