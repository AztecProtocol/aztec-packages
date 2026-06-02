import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  GENESIS_BLOCK_HEADER_HASH,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2BlockStream,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { AnchorBlockStore } from '../storage/anchor_block_store/index.js';
import { NoteStore } from '../storage/note_store/index.js';
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
    tipsStore = new L2TipsKVStore(store, 'pxe', GENESIS_BLOCK_HEADER_HASH);
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = new NoteStore(store, { isCanonical: () => true });
    privateEventStore = new PrivateEventStore(store, { isCanonical: () => true });
    contractSyncService = mock<ContractSyncService>();
    synchronizer = createSynchronizer();
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  it('updates anchor block on a reorg', async () => {
    const block3Hash = Fr.fromString('0x3');
    let reorgBlock: L2Block | undefined;
    aztecNode.getBlock.mockImplementation(async (block: any) => {
      if (block instanceof BlockHash && block.equals(block3Hash)) {
        reorgBlock = await L2Block.random(BlockNumber(3));
        return {
          header: reorgBlock.header,
          archive: reorgBlock.archive,
          hash: await reorgBlock.hash(),
          checkpointNumber: reorgBlock.checkpointNumber,
          indexWithinCheckpoint: reorgBlock.indexWithinCheckpoint,
          number: reorgBlock.number,
        } as any;
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

    // The anchor block should be updated to the reorg block header.
    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(reorgBlock!.header)).toBe(true);
  });

  describe('stop', () => {
    it('resolves immediately when no sync is in progress', async () => {
      await synchronizer.stop();
      expect(blockStream.stop).toHaveBeenCalled();
    });

    it('waits for in-progress sync to complete', async () => {
      let resolveSync!: () => void;
      const syncBlocker = new Promise<void>(resolve => {
        resolveSync = resolve;
      });
      blockStream.sync.mockReturnValue(syncBlocker);
      const genesisBlock = await L2Block.random(BlockNumber(0));
      const genesisBlockData: BlockData = {
        header: genesisBlock.header,
        archive: genesisBlock.archive,
        blockHash: await genesisBlock.hash(),
        checkpointNumber: genesisBlock.checkpointNumber,
        indexWithinCheckpoint: genesisBlock.indexWithinCheckpoint,
      };
      aztecNode.getBlockData.mockResolvedValue(genesisBlockData);

      // Start a sync (don't await)
      const syncPromise = synchronizer.sync();

      // stop() should not resolve until the sync finishes
      let stopped = false;
      const stopPromise = synchronizer.stop().then(() => {
        stopped = true;
      });

      // Give the event loop a tick
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(stopped).toBe(false);

      // Release the sync
      resolveSync();
      await syncPromise;
      await stopPromise;

      expect(stopped).toBe(true);
      expect(blockStream.stop).toHaveBeenCalled();
    });
  });

  describe('delete-on-prune', () => {
    // Two distinct, valid block-hash Fr values for forks at the same height.
    const HASH_A = Fr.fromString('0x0c').toString();
    const HASH_B = Fr.fromString('0x0a').toString();

    it('chain-pruned deletes rows anchored above the fork and keeps rows at or below it', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Seed notes at blocks 3, 4, and 5. block 3 is the fork point; 4 and 5 are on the abandoned fork.
      const noteAt3 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(3),
        l2BlockHash: HASH_A,
      });
      const noteAt4 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(4),
        l2BlockHash: HASH_A,
      });
      const noteAt5 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(5),
        l2BlockHash: HASH_A,
      });
      await noteStore.addNotes([noteAt3, noteAt4, noteAt5], scope, 'note-job');
      await noteStore.commit('note-job');

      // Seed events at blocks 3, 4, and 5.
      const eventSelector = EventSelector.random();
      const storeEvent = (eventId: Fr, blockNumber: number) =>
        privateEventStore.storePrivateEventLog(
          eventSelector,
          Fr.random(),
          [Fr.random()],
          eventId,
          {
            contractAddress: contract,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber: BlockNumber(blockNumber),
            l2BlockHash: BlockHash.fromString(HASH_A),
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'event-job',
        );
      const eventIdAt3 = Fr.random();
      const eventIdAt4 = Fr.random();
      const eventIdAt5 = Fr.random();
      await storeEvent(eventIdAt3, 3);
      await storeEvent(eventIdAt4, 4);
      await storeEvent(eventIdAt5, 5);
      await privateEventStore.commit('event-job');

      // Set the anchor to block 5 so the prune guard passes.
      const anchorBlock5 = await L2Block.random(BlockNumber(5));
      await anchorBlockStore.setHeader(anchorBlock5.header);

      // Mock the node to return a block at the fork hash for block 3.
      const forkBlock3 = await L2Block.random(BlockNumber(3));
      aztecNode.getBlock.mockImplementation((param: any) => {
        if (param instanceof BlockHash && param.equals(Fr.fromString(HASH_B))) {
          return Promise.resolve({ header: forkBlock3.header } as any);
        }
        return Promise.resolve(undefined);
      });

      // Prune back to block 3 (orphaning blocks 4 and 5).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: HASH_B },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Rows at blocks 4 and 5 must be gone.
      expect(await noteStore.nullifiersAtBlock(4)).toHaveLength(0);
      expect(await noteStore.nullifiersAtBlock(5)).toHaveLength(0);
      expect(await privateEventStore.eventIdsAtBlock(4)).toHaveLength(0);
      expect(await privateEventStore.eventIdsAtBlock(5)).toHaveLength(0);

      // Row at block 3 (the fork point, not an orphan) must survive.
      expect(await noteStore.nullifiersAtBlock(3)).toEqual([noteAt3.siloedNullifier.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(3)).toEqual([eventIdAt3.toString()]);
    });

    it('chain-finalized does not delete any rows', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Seed a note with two competing fork hashes at block 9 (simulating an unresolved fork).
      const noteCanonical = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(9),
        l2BlockHash: HASH_A,
      });
      const noteOrphan = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(9),
        l2BlockHash: HASH_B,
      });
      await noteStore.addNotes([noteCanonical, noteOrphan], scope, 'note-job');
      await noteStore.commit('note-job');

      const eventIdA = Fr.random();
      const eventIdB = Fr.random();
      const eventSelector = EventSelector.random();
      const storeEvent = (eventId: Fr, hash: string) =>
        privateEventStore.storePrivateEventLog(
          eventSelector,
          Fr.random(),
          [Fr.random()],
          eventId,
          {
            contractAddress: contract,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber: BlockNumber(9),
            l2BlockHash: BlockHash.fromString(hash),
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'event-job',
        );
      await storeEvent(eventIdA, HASH_A);
      await storeEvent(eventIdB, HASH_B);
      await privateEventStore.commit('event-job');

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(9), hash: HASH_A },
      });

      // Both rows survive: chain-finalized takes no storage action under delete-on-prune.
      const nullifiers = await noteStore.nullifiersAtBlock(9);
      expect(nullifiers).toHaveLength(2);
      const eventIds = await privateEventStore.eventIdsAtBlock(9);
      expect(eventIds).toHaveLength(2);
    });

    it('notes below the fork survive and remain queryable after a prune', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      const noteAt1 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(1),
        l2BlockHash: HASH_A,
      });
      const noteAt2 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(2),
        l2BlockHash: HASH_A,
      });
      const noteAt3 = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(3),
        l2BlockHash: HASH_A,
      });
      await noteStore.addNotes([noteAt1, noteAt2, noteAt3], scope, 'note-job');
      await noteStore.commit('note-job');

      // Anchor at block 3.
      const anchorBlock3 = await L2Block.random(BlockNumber(3));
      await anchorBlockStore.setHeader(anchorBlock3.header);

      // Mock block 1 for the new anchor after prune.
      const forkBlock1 = await L2Block.random(BlockNumber(1));
      aztecNode.getBlock.mockImplementation((param: any) => {
        if (param instanceof BlockHash) {
          return Promise.resolve({ header: forkBlock1.header } as any);
        }
        return Promise.resolve(undefined);
      });

      // Prune back to block 1 (orphaning blocks 2 and 3).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(1), hash: HASH_B },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Blocks 2 and 3 deleted.
      expect(await noteStore.nullifiersAtBlock(2)).toHaveLength(0);
      expect(await noteStore.nullifiersAtBlock(3)).toHaveLength(0);

      // Block 1 note still present and visible via getNotes.
      expect(await noteStore.nullifiersAtBlock(1)).toEqual([noteAt1.siloedNullifier.toString()]);
      const found = await noteStore.getNotes(
        { contractAddress: contract, scopes: [scope], status: NoteStatus.ACTIVE },
        'read-job',
      );
      expect(found).toHaveLength(1);
      expect(found[0].siloedNullifier.equals(noteAt1.siloedNullifier)).toBe(true);
    });
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

      // Mock node to return block
      const provenBlock = await L2Block.random(BlockNumber(5));
      aztecNode.getBlock.mockResolvedValue({ header: provenBlock.header } as any);

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

      // Mock node to return block
      const finalizedBlock = await L2Block.random(BlockNumber(10));
      aztecNode.getBlock.mockResolvedValue({ header: finalizedBlock.header } as any);

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

      // Prune to block 3 (above anchor) - should be ignored
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: '0x3' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Anchor should be unchanged
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
    });
  });
});
