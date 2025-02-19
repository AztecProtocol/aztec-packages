import { type AztecNode, L2Block, type L2BlockStream } from '@aztec/circuit-types';
import { timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsStore } from '@aztec/kv-store/stores';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { type PxeDatabase } from '../database/index.js';
import { KVPxeDatabase } from '../database/kv_pxe_database.js';
import { Synchronizer } from './synchronizer.js';

describe('Synchronizer', () => {
  let database: PxeDatabase;
  let synchronizer: Synchronizer;
  let tipsStore: L2TipsStore; // eslint-disable-line @typescript-eslint/no-unused-vars

  let aztecNode: MockProxy<AztecNode>;
  let blockStream: MockProxy<L2BlockStream>;

  const TestSynchronizer = class extends Synchronizer {
    protected override createBlockStream(): L2BlockStream {
      return blockStream;
    }
  };

  beforeEach(async () => {
    const store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    database = await KVPxeDatabase.create(store);
    tipsStore = new L2TipsStore(store, 'pxe');
    synchronizer = new TestSynchronizer(aztecNode, database, tipsStore);
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(1, 4);
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await database.getBlockHeader();
    expect(obtainedHeader).toEqual(block.header);
  });

  it('removes notes from db on a reorg', async () => {
    const removeNotesAfter = jest.spyOn(database, 'removeNotesAfter').mockImplementation(() => Promise.resolve());
    const unnullifyNotesAfter = jest.spyOn(database, 'unnullifyNotesAfter').mockImplementation(() => Promise.resolve());
    const resetNoteSyncData = jest.spyOn(database, 'resetNoteSyncData').mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(
      async blockNumber => (await L2Block.random(blockNumber as number)).header,
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2Block.random(i)),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', blockNumber: 3 });

    expect(removeNotesAfter).toHaveBeenCalledWith(3);
    expect(unnullifyNotesAfter).toHaveBeenCalledWith(3);
    expect(resetNoteSyncData).toHaveBeenCalled();
  });
});
