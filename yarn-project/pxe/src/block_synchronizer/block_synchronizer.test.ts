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
import { CanonicalBlockStore } from '../storage/canonical_block_store/index.js';
import { NoteStore } from '../storage/note_store/index.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let store: AztecAsyncKVStore;
  let tipsStore: L2TipsKVStore;
  let canonicalBlockStore: CanonicalBlockStore;
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
      canonicalBlockStore,
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
    canonicalBlockStore = new CanonicalBlockStore(store, tipsStore);
    await canonicalBlockStore.load();
    noteStore = new NoteStore(store, canonicalBlockStore);
    privateEventStore = new PrivateEventStore(store, canonicalBlockStore);
    contractSyncService = mock<ContractSyncService>();
    synchronizer = createSynchronizer();
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await canonicalBlockStore.getBlockHeader();
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
    const obtainedHeader = await canonicalBlockStore.getBlockHeader();
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
      aztecNode.getBlockNumber.mockResolvedValue(BlockNumber(0));
      aztecNode.getBlocks.mockResolvedValue([]);

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

  describe('canonical map', () => {
    it('records canonical hashes for all blocks in a blocks-added event', async () => {
      const blocks = await timesParallel(3, i => L2Block.random(BlockNumber(i + 1)));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks });

      for (const b of blocks) {
        expect(canonicalBlockStore.isCanonical({ number: b.number, hash: (await b.hash()).toString() })).toBe(true);
      }
    });

    it('clears orphaned suffix on chain-pruned and updates the anchor header', async () => {
      // Pre-record blocks 1..5
      const blocks = await timesParallel(5, i => L2Block.random(BlockNumber(i + 1)));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks });

      // The block at common ancestor 3 (hash) is what the prune event reports
      const commonAncestorBlock = blocks[2]; // blockNumber 3
      aztecNode.getBlock.mockImplementation(async (param: any) => {
        if (
          param instanceof BlockHash &&
          param.equals(Fr.fromString(await commonAncestorBlock.hash().then(h => h.toString())))
        ) {
          return {
            header: commonAncestorBlock.header,
            archive: commonAncestorBlock.archive,
            hash: await commonAncestorBlock.hash(),
            checkpointNumber: commonAncestorBlock.checkpointNumber,
            indexWithinCheckpoint: commonAncestorBlock.indexWithinCheckpoint,
            number: commonAncestorBlock.number,
          } as any;
        }
        return undefined;
      });

      const commonAncestorHash = (await commonAncestorBlock.hash()).toString();
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: commonAncestorHash },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Heights above 3 should no longer be canonical
      for (const b of blocks.filter(b => b.number > 3)) {
        expect(canonicalBlockStore.isCanonical({ number: b.number, hash: (await b.hash()).toString() })).toBe(false);
      }
      // Heights at or below 3 should still be canonical
      for (const b of blocks.filter(b => b.number <= 3)) {
        expect(canonicalBlockStore.isCanonical({ number: b.number, hash: (await b.hash()).toString() })).toBe(true);
      }
      // The new anchor header should be the common ancestor block
      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(commonAncestorBlock.header)).toBe(true);
    });

    // Two distinct, valid block-hash Fr values for the orphan/canonical forks at the same finalized height. The note
    // and event stores serialize l2BlockHash as a field element, so the hashes must be real field elements.
    const CANONICAL_HASH = Fr.fromString('0x0c').toString();
    const ORPHAN_HASH = Fr.fromString('0x0a').toString();

    it('chain-finalized reaps non-canonical rows in the newly-finalized range and advances the floor', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // The canonical fork at block 9 (a prior blocks-added would have recorded this).
      await canonicalBlockStore.setManyCanonical([{ number: BlockNumber(9), hash: CANONICAL_HASH }]);

      // A note on the canonical fork and a competing note on an orphaned fork, both created at block 9.
      const canonicalNote = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(9),
        l2BlockHash: CANONICAL_HASH,
      });
      const orphanNote = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(9),
        l2BlockHash: ORPHAN_HASH,
      });
      await noteStore.addNotes([canonicalNote, orphanNote], scope, 'note-job');
      await noteStore.commit('note-job');

      // Likewise a canonical and an orphan private event at block 9, sharing contract + selector.
      const eventSelector = EventSelector.random();
      const randomness = Fr.random();
      const msgContent = [Fr.random(), Fr.random()];
      const canonicalEventId = Fr.random();
      const orphanEventId = Fr.random();
      const storeEvent = (eventId: Fr, hash: string) =>
        privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent,
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
      await storeEvent(canonicalEventId, CANONICAL_HASH);
      await storeEvent(orphanEventId, ORPHAN_HASH);
      await privateEventStore.commit('event-job');

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(9), hash: CANONICAL_HASH },
      });

      // The orphan rows are reaped; only the canonical fork survives the finalization.
      expect(await noteStore.nullifiersAtBlock(9)).toEqual([canonicalNote.siloedNullifier.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(9)).toEqual([canonicalEventId.toString()]);

      // The floor is raised to the finalized height and the height's hashes are pruned from the reorg-able window.
      expect(canonicalBlockStore.getFinalizedFloor()).toBe(9);
      expect(canonicalBlockStore.getCanonicalHash(BlockNumber(9))).toBeUndefined();

      // With the hash pruned, every block at or below the floor is canonical: finalized ⇒ canonical.
      expect(canonicalBlockStore.isCanonical({ number: BlockNumber(9), hash: ORPHAN_HASH })).toBe(true);
    });

    it('keeps a canonical row at a finalized height visible after finalization', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      await canonicalBlockStore.setManyCanonical([{ number: BlockNumber(9), hash: CANONICAL_HASH }]);
      const canonicalNote = await NoteDao.random({
        contractAddress: contract,
        l2BlockNumber: BlockNumber(9),
        l2BlockHash: CANONICAL_HASH,
      });
      await noteStore.addNotes([canonicalNote], scope, 'note-job');
      await noteStore.commit('note-job');

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(9), hash: CANONICAL_HASH },
      });

      // The canonical note survives the reap, and stays visible via finalized ⇒ canonical even though its hash is gone.
      expect(await noteStore.nullifiersAtBlock(9)).toEqual([canonicalNote.siloedNullifier.toString()]);
      expect(canonicalBlockStore.getCanonicalHash(BlockNumber(9))).toBeUndefined();
      expect(canonicalBlockStore.isCanonical({ number: BlockNumber(9), hash: CANONICAL_HASH })).toBe(true);
      const found = await noteStore.getNotes(
        { contractAddress: contract, scopes: [scope], status: NoteStatus.ACTIVE },
        'read-job',
      );
      expect(found).toHaveLength(1);
      expect(found[0].siloedNullifier.equals(canonicalNote.siloedNullifier)).toBe(true);
    });
  });

  describe('syncChainTip config', () => {
    it('updates anchor on blocks-added when syncChainTip is proposed (default)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });
      const block = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(block.header)).toBe(true);
    });

    it('does not update anchor on blocks-added when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // First set a known anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalBlockStore.setHeader(initialBlock.header);

      // blocks-added should NOT update the anchor
      const newBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [newBlock] });

      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-checkpointed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalBlockStore.setHeader(initialBlock.header);

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

      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
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
      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-proven when syncChainTip is proven', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proven' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalBlockStore.setHeader(initialBlock.header);

      // Mock node to return block
      const provenBlock = await L2Block.random(BlockNumber(5));
      aztecNode.getBlock.mockResolvedValue({ header: provenBlock.header } as any);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(5), hash: '0x789' },
      });

      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(provenBlock.header)).toBe(true);
    });

    it('updates anchor on chain-finalized when syncChainTip is finalized', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'finalized' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalBlockStore.setHeader(initialBlock.header);

      // Mock node to return block
      const finalizedBlock = await L2Block.random(BlockNumber(10));
      aztecNode.getBlock.mockResolvedValue({ header: finalizedBlock.header } as any);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(10), hash: '0xabc' },
      });

      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(finalizedBlock.header)).toBe(true);
    });

    it('ignores prune event when anchor is already at or below prune point', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set anchor to block 2
      const anchorBlock = await L2Block.random(BlockNumber(2));
      await canonicalBlockStore.setHeader(anchorBlock.header);

      // Prune to block 3 (above anchor) - should be ignored
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: '0x3' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Anchor should be unchanged
      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
    });
  });
});
