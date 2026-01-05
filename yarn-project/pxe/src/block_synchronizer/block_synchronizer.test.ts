import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2BlockNew, type L2BlockStream } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { NoteDataProvider } from '../storage/note_data_provider/note_data_provider.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let tipsStore: L2TipsKVStore;
  let anchorBlockDataProvider: AnchorBlockDataProvider;
  let noteDataProvider: NoteDataProvider;
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
    synchronizer = new TestSynchronizer(aztecNode, anchorBlockDataProvider, noteDataProvider, tipsStore);
  });

  it('sets header from latest block', async () => {
    const block = await L2BlockNew.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockDataProvider.getBlockHeader();
    expect(obtainedHeader).toEqual(block.header);
  });

  it('removes notes from db on a reorg', async () => {
    const rollbackNotesAndNullifiers = jest
      .spyOn(noteDataProvider, 'rollbackNotesAndNullifiers')
      .mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(async blockNumber =>
      (await L2Block.random(BlockNumber(blockNumber as number))).getBlockHeader(),
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2BlockNew.random(BlockNumber(i))),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', block: { number: BlockNumber(3), hash: '0x3' } });

    expect(rollbackNotesAndNullifiers).toHaveBeenCalledWith(3, 4);
  });
});
