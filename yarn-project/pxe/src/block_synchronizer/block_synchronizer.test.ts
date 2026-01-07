import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { L2Block, L2BlockNew, type L2BlockStream } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let tipsStore: L2TipsKVStore;
  let anchorBlockStore: AnchorBlockStore;
  let noteStore: NoteStore;
  let privateEventStore: PrivateEventStore;
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
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = await NoteStore.create(store);
    privateEventStore = new PrivateEventStore(store);
    synchronizer = new TestSynchronizer(aztecNode, anchorBlockStore, noteStore, privateEventStore, tipsStore);
  });

  it('sets header from latest block', async () => {
    const block = await L2BlockNew.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader).toEqual(block.header);
  });

  it('removes notes from db on a reorg', async () => {
    const rollbackNotesAndNullifiers = jest
      .spyOn(noteStore, 'rollbackNotesAndNullifiers')
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

  it('removes private events from db on a reorg', async () => {
    const rollbackEventsAfterBlock = jest
      .spyOn(privateEventStore, 'rollbackEventsAfterBlock')
      .mockImplementation(() => Promise.resolve());
    aztecNode.getBlockHeader.mockImplementation(async blockNumber =>
      (await L2Block.random(BlockNumber(blockNumber as number))).getBlockHeader(),
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, randomPublishedL2Block),
    });
    await synchronizer.handleBlockStreamEvent({ type: 'chain-pruned', block: { number: BlockNumber(3), hash: '0x3' } });

    expect(rollbackEventsAfterBlock).toHaveBeenCalledWith(3, 4);
  });
});
