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

import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { CanonicalBlockStore } from '../storage/canonical_block_store/index.js';
import { BlockSynchronizer } from './block_synchronizer.js';

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let store: AztecAsyncKVStore;
  let tipsStore: L2TipsKVStore;
  let canonicalBlockStore: CanonicalBlockStore;
  let aztecNode: MockProxy<AztecNode>;
  let blockStream: MockProxy<L2BlockStream>;
  let contractSyncService: MockProxy<ContractSyncService>;

  const TestSynchronizer = class extends BlockSynchronizer {
    protected override createBlockStream(): L2BlockStream {
      return blockStream;
    }
  };

  const createSynchronizer = (config: Partial<BlockSynchronizerConfig> = {}) => {
    return new TestSynchronizer(aztecNode, store, canonicalBlockStore, tipsStore, contractSyncService, config);
  };

  beforeEach(async () => {
    store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    tipsStore = new L2TipsKVStore(store, 'pxe', GENESIS_BLOCK_HEADER_HASH);
    canonicalBlockStore = new CanonicalBlockStore(store);
    await canonicalBlockStore.load();
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
    it('hydrates the canonical map from finality on cold start', async () => {
      // Provide the genesis header so doSync can set the initial anchor.
      const genesisBlock = await L2Block.random(BlockNumber(0));
      const genesisBlockData: BlockData = {
        header: genesisBlock.header,
        archive: genesisBlock.archive,
        blockHash: await genesisBlock.hash(),
        checkpointNumber: genesisBlock.checkpointNumber,
        indexWithinCheckpoint: genesisBlock.indexWithinCheckpoint,
      };
      aztecNode.getBlockData.mockResolvedValue(genesisBlockData);

      // finalized tip = 2, latest tip = 4.
      aztecNode.getBlockNumber.mockImplementation((tip?: string) =>
        Promise.resolve(BlockNumber(tip === 'finalized' ? 2 : 4)),
      );

      // Build blocks 2..4 with deterministic hashes (L2Block.random gives each a unique archive root).
      const blocksByNumber = new Map<number, { hash: BlockHash; header: any; archive: any; number: number }>();
      for (let h = 2; h <= 4; h++) {
        const b = await L2Block.random(BlockNumber(h));
        blocksByNumber.set(h, { hash: await b.hash(), header: b.header, archive: b.archive, number: h });
      }

      // Mock getBlocks(from, limit) — doSync calls node.getBlocks and reads `.hash` and `.number` as properties.
      aztecNode.getBlocks.mockImplementation((from: any, limit: number) => {
        const start = Number(from);
        const result = [];
        for (let n = start; n < start + limit; n++) {
          const entry = blocksByNumber.get(n);
          if (entry) {
            result.push({
              hash: entry.hash,
              header: entry.header,
              archive: entry.archive,
              number: entry.number,
            } as any);
          }
        }
        return Promise.resolve(result);
      });

      // blockStream.sync() resolves immediately (no events).
      blockStream.sync.mockResolvedValue(undefined);

      await synchronizer.sync();

      expect(canonicalBlockStore.getFloor()).toBe(2);
      expect(canonicalBlockStore.getHighestFinalized()).toBe(2);

      // All three hydrated heights must be canonical with the hashes doSync stored.
      for (const [n, entry] of blocksByNumber) {
        expect(canonicalBlockStore.isCanonical({ blockNumber: n, blockHash: entry.hash.toString() })).toBe(true);
      }

      // A competing hash at a hydrated height is NOT canonical.
      expect(canonicalBlockStore.isCanonical({ blockNumber: 3, blockHash: '0xdeadbeef' })).toBe(false);
    });

    it('records canonical hashes for all blocks in a blocks-added event', async () => {
      const blocks = await timesParallel(3, i => L2Block.random(BlockNumber(i + 1)));
      await synchronizer.handleBlockStreamEvent({ type: 'blocks-added', blocks });

      for (const b of blocks) {
        expect(canonicalBlockStore.isCanonical({ blockNumber: b.number, blockHash: (await b.hash()).toString() })).toBe(
          true,
        );
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
        expect(canonicalBlockStore.isCanonical({ blockNumber: b.number, blockHash: (await b.hash()).toString() })).toBe(
          false,
        );
      }
      // Heights at or below 3 should still be canonical
      for (const b of blocks.filter(b => b.number <= 3)) {
        expect(canonicalBlockStore.isCanonical({ blockNumber: b.number, blockHash: (await b.hash()).toString() })).toBe(
          true,
        );
      }
      // The new anchor header should be the common ancestor block
      const obtainedHeader = await canonicalBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(commonAncestorBlock.header)).toBe(true);
    });

    it('chain-finalized advances the finality tracker without changing the floor', async () => {
      const initialFloor = canonicalBlockStore.getFloor();

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(7), hash: '0xfin' },
      });

      expect(canonicalBlockStore.getHighestFinalized()).toBe(7);
      expect(canonicalBlockStore.getFloor()).toBe(initialFloor);
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
