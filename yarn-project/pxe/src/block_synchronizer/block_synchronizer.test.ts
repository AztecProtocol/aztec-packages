import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
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

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { CanonicalChainStore } from '../storage/canonical_chain_store/canonical_chain_store.js';
import { FactStore } from '../storage/fact_store/fact_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let store: AztecAsyncKVStore;
  let tipsStore: L2TipsKVStore;
  let canonicalChainStore: CanonicalChainStore;
  let noteStore: NoteStore;
  let privateEventStore: PrivateEventStore;
  let factStore: FactStore;
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
      canonicalChainStore,
      noteStore,
      privateEventStore,
      factStore,
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
    canonicalChainStore = new CanonicalChainStore(store);
    noteStore = new NoteStore(store, canonicalChainStore);
    privateEventStore = new PrivateEventStore(store, { isCanonical: () => Promise.resolve(true) });
    factStore = new FactStore(store, canonicalChainStore);
    contractSyncService = mock<ContractSyncService>();
    synchronizer = createSynchronizer();
  });

  it('sets header from latest block', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

    const obtainedHeader = await canonicalChainStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  // The NoteStore no longer needs a destructive rollback on a reorg: notes carry their own L2 anchor and the read
  // path filters by canonicality, so a chain-pruned event invalidates them transparently through the canonical chain
  // store. The corresponding behavioral test would belong on NoteStore itself.

  // Like the NoteStore, the PrivateEventStore no longer needs a destructive rollback on a reorg: events carry their
  // own L2 anchor and `getPrivateEvents` filters by canonicality, so a chain-pruned event invalidates them
  // transparently through the canonical chain store.

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
      aztecNode.getChainTips.mockResolvedValue({
        proposed: { number: BlockNumber(0), hash: '0x0' },
        checkpointed: {
          block: { number: BlockNumber(0), hash: '0x0' },
          checkpoint: { number: CheckpointNumber(0), hash: '0x0' },
        },
        proven: {
          block: { number: BlockNumber(0), hash: '0x0' },
          checkpoint: { number: CheckpointNumber(0), hash: '0x0' },
        },
        finalized: {
          block: { number: BlockNumber(0), hash: '0x0' },
          checkpoint: { number: CheckpointNumber(0), hash: '0x0' },
        },
      });
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

  describe('canonical chain map', () => {
    it('records each block hash in the canonical map on blocks-added', async () => {
      const block = await L2Block.random(BlockNumber(5));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const stored = await canonicalChainStore.hashAt(5);
      expect(stored).toBe((await block.hash()).toString());
    });

    it('clears entries above the common ancestor on chain-pruned', async () => {
      const blocks = await timesParallel(5, i => L2Block.random(BlockNumber(i + 1)));
      const block5Hash = Fr.fromString('0x5');

      // Mock node so the prune handler can fetch the anchor block for the reorg point (block 3)
      aztecNode.getBlock.mockImplementation(async (blockRef: any) => {
        if (blockRef instanceof BlockHash && blockRef.equals(block5Hash)) {
          const b = await L2Block.random(BlockNumber(3));
          return {
            header: b.header,
            archive: b.archive,
            hash: await b.hash(),
            checkpointNumber: b.checkpointNumber,
            indexWithinCheckpoint: b.indexWithinCheckpoint,
            number: b.number,
          } as any;
        }
        return undefined;
      });

      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks });

      // Verify block 5 is in the map before the prune
      const block5 = blocks[4];
      const hashBefore = await canonicalChainStore.hashAt(5);
      expect(hashBefore).toBe((await block5.hash()).toString());

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: block5Hash.toString() },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      // Block 5 (above prune point 3) should have been cleared
      const hashAfter = await canonicalChainStore.hashAt(5);
      expect(hashAfter).toBeUndefined();
    });
  });

  describe('syncChainTip config', () => {
    it('updates anchor on blocks-added when syncChainTip is proposed (default)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });
      const block = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(block.header)).toBe(true);
    });

    it('does not update anchor on blocks-added when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // First set a known anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalChainStore.setHeader(initialBlock.header);

      // blocks-added should NOT update the anchor
      const newBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks: [newBlock] });

      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-checkpointed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalChainStore.setHeader(initialBlock.header);

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

      const obtainedHeader = await canonicalChainStore.getBlockHeader();
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
      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-proven when syncChainTip is proven', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proven' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalChainStore.setHeader(initialBlock.header);

      // Mock node to return block
      const provenBlock = await L2Block.random(BlockNumber(5));
      aztecNode.getBlock.mockResolvedValue({ header: provenBlock.header } as any);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(5), hash: '0x789' },
      });

      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(provenBlock.header)).toBe(true);
    });

    it('updates anchor on chain-finalized when syncChainTip is finalized', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'finalized' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await canonicalChainStore.setHeader(initialBlock.header);

      // Mock node to return block
      const finalizedBlock = await L2Block.random(BlockNumber(10));
      aztecNode.getBlock.mockResolvedValue({ header: finalizedBlock.header } as any);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(10), hash: '0xabc' },
      });

      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(finalizedBlock.header)).toBe(true);
    });

    it('ignores prune event when anchor is already at or below prune point', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set anchor to block 2
      const anchorBlock = await L2Block.random(BlockNumber(2));
      await canonicalChainStore.setHeader(anchorBlock.header);

      const clearAbove = jest.spyOn(canonicalChainStore, 'clearAbove');

      // Prune to block 3 (above anchor) - should be ignored
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: '0x3' },
        checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
      });

      expect(clearAbove).not.toHaveBeenCalled();

      // Anchor should be unchanged
      const obtainedHeader = await canonicalChainStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
    });
  });
});
