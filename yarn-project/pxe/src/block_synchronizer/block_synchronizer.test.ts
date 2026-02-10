import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { BlockHash, GENESIS_CHECKPOINT_HEADER_HASH, L2Block, type L2BlockStream } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let store: AztecAsyncKVStore;
  let tipsStore: L2TipsKVStore;
  let anchorBlockStore: AnchorBlockStore;
  let noteStore: NoteStore;
  let privateEventStore: PrivateEventStore;
  let aztecNode: MockProxy<AztecNode>;
  let blockStream: MockProxy<L2BlockStream>;
  let contractSyncService: MockProxy<ContractSyncService>;

  const TestSynchronizer = class extends BlockSynchronizer {
    protected override createBlockStream(): L2BlockStream {
      return blockStream;
    }
  };

  const createSynchronizer = (config: Partial<BlockSynchronizerConfig> = {}) => {
    return new TestSynchronizer(
      aztecNode,
      store,
      anchorBlockStore,
      noteStore,
      privateEventStore,
      tipsStore,
      contractSyncService,
      config,
    );
  };

  beforeEach(async () => {
    store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    tipsStore = new L2TipsKVStore(store, 'pxe');
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = new NoteStore(store);
    privateEventStore = new PrivateEventStore(store);
    contractSyncService = mock<ContractSyncService>();
    synchronizer = createSynchronizer();
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  it('removes notes from db on a reorg', async () => {
    const rollback = jest.spyOn(noteStore, 'rollback').mockImplementation(() => Promise.resolve());
    const block3Hash = Fr.fromString('0x3');
    aztecNode.getBlockHeader.mockImplementation(async block => {
      // For the test, when block hash matches block 3, return block header for block 3
      if (block instanceof BlockHash && block.equals(block3Hash)) {
        return (await L2Block.random(BlockNumber(3))).header;
      }
      return undefined;
    });

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2Block.random(BlockNumber(i))),
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
      if (block instanceof BlockHash && block.equals(block3Hash)) {
        return (await L2Block.random(BlockNumber(3))).header;
      }
      return undefined;
    });

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2Block.random(BlockNumber(i))),
    });
    await synchronizer.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: { number: BlockNumber(3), hash: block3Hash.toString() },
      checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
    });

    expect(rollback).toHaveBeenCalledWith(3, 4);
  });

  describe('syncChainTip config', () => {
    it('updates anchor on blocks-added when syncChainTip is proposed (default)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });
      const block = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(block.header)).toBe(true);
    });

    it('does not update anchor on blocks-added when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // First set a known anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // blocks-added should NOT update the anchor
      const newBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [newBlock] });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-checkpointed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // Create a checkpoint with a block
      const checkpointBlock = await L2Block.random(BlockNumber(1));
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });
      // Replace the random block with our known block
      checkpoint.blocks[0] = checkpointBlock;

      const publishedCheckpoint = new PublishedCheckpoint(checkpoint, L1PublishedData.random(), []);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoint,
        block: { number: BlockNumber(1), hash: '0x456' },
      });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(checkpointBlock.header)).toBe(true);
    });

    it('does not update anchor on chain-checkpointed when syncChainTip is proposed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });

      // Set initial anchor via blocks-added
      const initialBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [initialBlock] });

      // Create a different checkpoint
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });
      const publishedCheckpoint = new PublishedCheckpoint(checkpoint, L1PublishedData.random(), []);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        checkpoint: publishedCheckpoint,
        block: { number: BlockNumber(1), hash: '0x456' },
      });

      // Anchor should still be the initial block, not the checkpoint block
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-proven when syncChainTip is proven', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proven' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // Mock node to return block header
      const provenBlock = await L2Block.random(BlockNumber(5));
      aztecNode.getBlockHeader.mockResolvedValue(provenBlock.header);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(5), hash: '0x789' },
      });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(provenBlock.header)).toBe(true);
    });

    it('updates anchor on chain-finalized when syncChainTip is finalized', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'finalized' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // Mock node to return block header
      const finalizedBlock = await L2Block.random(BlockNumber(10));
      aztecNode.getBlockHeader.mockResolvedValue(finalizedBlock.header);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(10), hash: '0xabc' },
      });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(finalizedBlock.header)).toBe(true);
    });

    it('ignores prune event when anchor is already at or below prune point', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set anchor to block 2
      const anchorBlock = await L2Block.random(BlockNumber(2));
      await anchorBlockStore.setHeader(anchorBlock.header);

      const rollback = jest.spyOn(noteStore, 'rollback').mockImplementation(() => Promise.resolve());

      // Prune to block 3 (above anchor) - should be ignored
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: '0x3' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      expect(rollback).not.toHaveBeenCalled();

      // Anchor should be unchanged
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
    });
  });
});
