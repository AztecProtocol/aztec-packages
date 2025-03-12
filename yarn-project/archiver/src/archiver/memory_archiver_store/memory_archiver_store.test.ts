import { times, timesParallel } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { L2Block } from '@aztec/stdlib/block';

import type { ArchiverDataStore } from '../archiver_store.js';
import { describeArchiverDataStore } from '../archiver_store_test_suite.js';
import { MemoryArchiverStore } from './memory_archiver_store.js';

describe('MemoryArchiverStore', () => {
  let archiverStore: ArchiverDataStore;

  beforeEach(() => {
    archiverStore = new MemoryArchiverStore(1000);
  });

  describeArchiverDataStore('implements ArchiverStore', () => archiverStore);

  describe('getPublicLogs config', () => {
    it('does not return more than "maxLogs" logs', async () => {
      const maxLogs = 5;
      archiverStore = new MemoryArchiverStore(maxLogs);
      const blocks = await timesParallel(10, async (index: number) => ({
        block: await L2Block.random(index + 1, 4, 3, 2),
        l1: { blockNumber: BigInt(index), blockHash: `0x${index}`, timestamp: BigInt(index) },
        signatures: times(3, Signature.random),
      }));

      await archiverStore.addBlocks(blocks);
      await archiverStore.addLogs(blocks.map(b => b.block));

      const response = await archiverStore.getPublicLogs({});

      expect(response.maxLogsHit).toBeTruthy();
      expect(response.logs.length).toEqual(maxLogs);
    });
  });
});
