import { timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2Block, type L2BlockStream } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { randomPublishedL2Block } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { SyncDataProvider } from '../storage/sync_data_provider/sync_data_provider.js';
import { TaggingDataProvider } from '../storage/tagging_data_provider/tagging_data_provider.js';
import { Synchronizer } from './synchronizer.js';

describe('Synchronizer', () => {
  let synchronizer: Synchronizer;
  let tipsStore: L2TipsKVStore;
  let syncDataProvider: SyncDataProvider;
  let noteDataProvider: NoteDataProvider;
  let taggingDataProvider: TaggingDataProvider;
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
    tipsStore = new L2TipsKVStore(store, 'pxe');
    syncDataProvider = new SyncDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    taggingDataProvider = new TaggingDataProvider(store);
    synchronizer = new TestSynchronizer(aztecNode, syncDataProvider, noteDataProvider, taggingDataProvider, tipsStore);
  });

  it('sets header from latest block', async () => {
    const block = await randomPublishedL2Block(1);
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await syncDataProvider.getBlockHeader();
    expect(obtainedHeader).toEqual(block.block.header);
  });

  it('removes notes from db on a reorg', async () => {
    const removeNotesAfter = jest
      .spyOn(noteDataProvider, 'removeNotesAfter')
      .mockImplementation(() => Promise.resolve());
    const unnullifyNotesAfter = jest
      .spyOn(noteDataProvider, 'unnullifyNotesAfter')
      .mockImplementation(() => Promise.resolve());
    const resetNoteSyncData = jest
      .spyOn(taggingDataProvider, 'resetNoteSyncData')
      .mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(
      async blockNumber => (await L2Block.random(blockNumber as number)).header,
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, randomPublishedL2Block),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', block: { number: 3, hash: '0x3' } });

    expect(removeNotesAfter).toHaveBeenCalledWith(3);
    expect(unnullifyNotesAfter).toHaveBeenCalledWith(3, 4);
    expect(resetNoteSyncData).toHaveBeenCalled();
  });
});
