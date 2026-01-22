import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { GENESIS_CHECKPOINT_HEADER_HASH, L2BlockHash, L2BlockNew, type L2BlockStream } from '@aztec/stdlib/block';
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
    const log = createLogger('pxe:test');
    const store = await openTmpStore('test', log);
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    tipsStore = new L2TipsKVStore(store, 'pxe');
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = new NoteStore(store, log);
    privateEventStore = new PrivateEventStore(store, log);
    synchronizer = new TestSynchronizer(
      aztecNode,
      store,
      anchorBlockStore,
      noteStore,
      privateEventStore,
      tipsStore,
      log,
    );
  });

  it('sets header from latest block', async () => {
    const block = await L2BlockNew.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  it('removes notes from db on a reorg', async () => {
    const rollback = jest.spyOn(noteStore, 'rollback').mockImplementation(() => Promise.resolve());
    const block3Hash = Fr.fromString('0x3');
    aztecNode.getBlockHeader.mockImplementation(async block => {
      // For the test, when block hash matches block 3, return block header for block 3
      if (block instanceof L2BlockHash && Fr.fromBuffer(block.toBuffer()).equals(block3Hash)) {
        return (await L2BlockNew.random(BlockNumber(3))).header;
      }
      return undefined;
    });

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2BlockNew.random(BlockNumber(i))),
    });
    await synchronizer.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(3), hash: block3Hash.toString() },
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    expect(rollback).toHaveBeenCalledWith(3, 4);
  });

  it('removes private events from db on a reorg', async () => {
    const rollback = jest.spyOn(privateEventStore, 'rollback').mockImplementation(() => Promise.resolve());
    const block3Hash = Fr.fromString('0x3');
    aztecNode.getBlockHeader.mockImplementation(async block => {
      // For the test, when block hash matches block 3, return block header for block 3
      if (block instanceof L2BlockHash && Fr.fromBuffer(block.toBuffer()).equals(block3Hash)) {
        return (await L2BlockNew.random(BlockNumber(3))).header;
      }
      return undefined;
    });

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2BlockNew.random(BlockNumber(i))),
    });
    await synchronizer.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(3), hash: block3Hash.toString() },
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    expect(rollback).toHaveBeenCalledWith(3, 4);
  });
});
