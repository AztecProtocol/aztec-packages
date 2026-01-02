import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2Block, type L2BlockStream } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { randomPublishedL2Block } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { RecipientTaggingDataProvider } from '../storage/tagging_data_provider/recipient_tagging_data_provider.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let tipsStore: L2TipsKVStore;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let noteDataProvider: NoteDataProvider;
  let recipientTaggingDataProvider: RecipientTaggingDataProvider;
  let aztecNode: MockProxy<AztecNode>;
  let blockStream: MockProxy<L2BlockStream>;

  const TestSynchronizer = class extends BlockSynchronizer {
    protected override createBlockStream(): L2BlockStream {
      return blockStream;
    }
  };

  beforeEach(async () => {
    const store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    tipsStore = new L2TipsKVStore(store, 'pxe');
    anchorBlockDataProvider = new AnchorBlockDataProvider(store);
    noteDataProvider = await NoteDataProvider.create(store);
    recipientTaggingDataProvider = new RecipientTaggingDataProvider(store);
    synchronizer = new TestSynchronizer(
      aztecNode,
      anchorBlockDataProvider,
      noteDataProvider,
      recipientTaggingDataProvider,
      tipsStore,
    );
  });

  it('sets header from latest block', async () => {
    const block = await randomPublishedL2Block(1);
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockDataProvider.getBlockHeader();
    expect(obtainedHeader).toEqual(block.block.getBlockHeader());
  });

  it('removes notes from db on a reorg', async () => {
    const rollbackNotesAndNullifiers = jest
      .spyOn(noteDataProvider, 'rollbackNotesAndNullifiers')
      .mockImplementation(() => Promise.resolve());
    const resetNoteSyncData = jest
      .spyOn(recipientTaggingDataProvider, 'resetNoteSyncData')
      .mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(async blockNumber =>
      (await L2Block.random(BlockNumber(blockNumber as number))).getBlockHeader(),
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, randomPublishedL2Block),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', block: { number: BlockNumber(3), hash: '0x3' } });

    // Third argument is the optional JobContext, which is undefined when sync is called without a context
    expect(rollbackNotesAndNullifiers).toHaveBeenCalledWith(3, 4, undefined);
    expect(resetNoteSyncData).toHaveBeenCalledWith(undefined);
  });
});
