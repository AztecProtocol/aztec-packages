import { type AztecNode, L2Block, type L2BlockStream } from '@aztec/circuit-types';
import { L2TipsStore } from '@aztec/kv-store/stores';
import { openTmpStore } from '@aztec/kv-store/utils';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

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

  beforeEach(() => {
    const store = openTmpStore();
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    database = new KVPxeDatabase(store);
    tipsStore = new L2TipsStore(store, 'pxe');
    synchronizer = new TestSynchronizer(aztecNode, database, tipsStore);
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(1, 4);
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = database.getBlockHeader();
    expect(obtainedHeader).toEqual(block.header);
  });

  it('removes notes from db on a reorg', async () => {
    const removeNotesAfter = jest.spyOn(database, 'removeNotesAfter').mockImplementation(() => Promise.resolve());
    const unnullifyNotesAfter = jest.spyOn(database, 'unnullifyNotesAfter').mockImplementation(() => Promise.resolve());
    const resetNoteSyncData = jest.spyOn(database, 'resetNoteSyncData').mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(blockNumber =>
      Promise.resolve(L2Block.random(blockNumber as number).header),
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await Promise.all(times(5, L2Block.random)),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', blockNumber: 3 });

    expect(removeNotesAfter).toHaveBeenCalledWith(3);
    expect(unnullifyNotesAfter).toHaveBeenCalledWith(3);
    expect(resetNoteSyncData).toHaveBeenCalled();
  });
});
