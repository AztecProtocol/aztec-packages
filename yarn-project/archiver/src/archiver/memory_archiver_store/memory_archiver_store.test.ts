import { L2Block } from '@aztec/circuit-types';
import { times } from '@aztec/foundation/collection';

import { type ArchiverDataStore } from '../archiver_store.js';
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
      const blocks = times(10, (index: number) => ({
        data: L2Block.random(index + 1, 4, 3, 2),
        l1: { blockNumber: BigInt(index), blockHash: `0x${index}`, timestamp: BigInt(index) },
      }));

      await archiverStore.addBlocks(blocks);
      await archiverStore.addLogs(blocks.map(b => b.data));

      const response = await archiverStore.getPublicLogs({});

      expect(response.maxLogsHit).toBeTruthy();
      expect(response.logs.length).toEqual(maxLogs);
    });
  });
});
