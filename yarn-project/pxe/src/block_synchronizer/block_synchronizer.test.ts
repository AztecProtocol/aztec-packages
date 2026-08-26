import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  GENESIS_BLOCK_HEADER_HASH,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2BlockId,
  type L2BlockStream,
  type L2BlockStreamEvent,
  makeL2BlockId,
  makeL2CheckpointId,
} from '@aztec/stdlib/block';
import type { AztecNode, BlockResponse } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract/contract_sync_service.js';
import { type CachingAztecNode, withCache } from '../node/caching_aztec_node.js';
import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { readNotes } from '../storage/note_store/test_utils.js';
import type { Rollbackable } from '../storage/rollbackable.js';
import { BlockSynchronizer } from './block_synchronizer.js';

// `AztecNode.getBlock` is generic over its include-options; `Parameters`/`ReturnType` collapse that
// type parameter to its `BlockIncludeOptions` constraint, yielding a concrete signature the mock can satisfy.
type NodeGetBlockMock = jest.MockedFunction<
  (...args: Parameters<AztecNode['getBlock']>) => ReturnType<AztecNode['getBlock']>
>;

describe('BlockSynchronizer', () => {
  let synchronizer: BlockSynchronizer;
  let store: AztecAsyncKVStore;
  let tipsStore: L2TipsKVStore;
  let anchorBlockStore: AnchorBlockStore;
  let noteStore: NoteStore;
  let rollbackables: MockProxy<Rollbackable>[];
  let aztecNode: MockProxy<AztecNode>;
  let getBlock: NodeGetBlockMock;
  let blockStream: MockProxy<L2BlockStream>;
  let contractSyncService: MockProxy<ContractSyncService>;
  let cachedNode: CachingAztecNode;

  const TestSynchronizer = class extends BlockSynchronizer {
    protected override createBlockStream(): L2BlockStream {
      return blockStream;
    }
  };

  const createSynchronizer = (
    config: Partial<BlockSynchronizerConfig> = {},
    storesToRollBack: Rollbackable[] = rollbackables,
  ) => {
    return new TestSynchronizer(
      cachedNode,
      store,
      anchorBlockStore,
      storesToRollBack,
      tipsStore,
      contractSyncService,
      config,
    );
  };

  // Builds the BlockResponse the node returns for a block (handlers read its header to update the anchor).
  const blockResponse = async (block: L2Block): Promise<BlockResponse> => ({
    header: block.header,
    archive: block.archive,
    hash: await block.hash(),
    checkpointNumber: block.checkpointNumber,
    indexWithinCheckpoint: block.indexWithinCheckpoint,
    number: block.number,
  });

  // The L2BlockId (number + hash) for a block, as carried by block-stream events.
  const blockId = async (block: L2Block): Promise<L2BlockId> =>
    makeL2BlockId(block.number, (await block.hash()).toString());

  // Configures the node to serve `block` by hash.
  const serveBlock = async (block: L2Block) => {
    const response = await blockResponse(block);
    getBlock.mockImplementation(param =>
      Promise.resolve(param instanceof BlockHash && param.equals(response.hash) ? response : undefined),
    );
  };

  // Builds a note DAO anchored to the given block id (caller adds it to the store and commits).
  const noteAt = (contract: AztecAddress, block: L2BlockId): Promise<NoteDao> =>
    NoteDao.random({ contractAddress: contract, l2BlockNumber: block.number, l2BlockHash: block.hash });

  // A chain-pruned event forking back to `block`, with the checkpointed and proven cursors left at genesis.
  const prunedEvent = (block: L2BlockId): L2BlockStreamEvent => {
    const genesisTip = {
      block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
      checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
    };
    return { type: 'chain-pruned', block, checkpointed: genesisTip, proven: genesisTip };
  };

  beforeEach(async () => {
    store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    getBlock = aztecNode.getBlock as NodeGetBlockMock;
    tipsStore = new L2TipsKVStore(store, 'pxe', GENESIS_BLOCK_HEADER_HASH);
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = new NoteStore(store);
    rollbackables = [mock<Rollbackable>(), mock<Rollbackable>()];
    contractSyncService = mock<ContractSyncService>();
    cachedNode = withCache(aztecNode);
    synchronizer = createSynchronizer();
  });

  // Emits a chain-proposed tip event for the given block (the tip event PXE anchors on in proposed mode).
  const proposedEvent = async (block: L2Block): Promise<L2BlockStreamEvent> => ({
    type: 'chain-proposed',
    block: makeL2BlockId(block.number, (await block.hash()).toString()),
    header: block.header,
  });

  it('sets header from the proposed tip', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await synchronizer.handleBlockStreamEvent(await proposedEvent(block));

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  it('wipes the contract sync and node read caches when the anchor block changes', async () => {
    const block = await L2Block.random(BlockNumber(1));
    const referenceBlock = BlockHash.random();
    const contractAddress = await AztecAddress.random();
    const storageSlot = Fr.random();
    aztecNode.getPublicStorageAt.mockResolvedValue(new Fr(1));
    await cachedNode.getPublicStorageAt(referenceBlock, contractAddress, storageSlot);
    await cachedNode.getPublicStorageAt(referenceBlock, contractAddress, storageSlot);
    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(1);

    await synchronizer.handleBlockStreamEvent(await proposedEvent(block));

    expect(contractSyncService.wipe).toHaveBeenCalled();
    // The anchor update wiped the node read cache: the same read reaches the node again.
    await cachedNode.getPublicStorageAt(referenceBlock, contractAddress, storageSlot);
    expect(aztecNode.getPublicStorageAt).toHaveBeenCalledTimes(2);
  });

  it('updates anchor block on a reorg', async () => {
    const reorgBlock = await L2Block.random(BlockNumber(3));
    await serveBlock(reorgBlock);

    // Anchor sits above the prune target so the prune guard lets the rollback through.
    const anchorBlock = await L2Block.random(BlockNumber(4));
    await anchorBlockStore.setHeader(anchorBlock.header);

    await synchronizer.handleBlockStreamEvent(prunedEvent(await blockId(reorgBlock)));

    // The anchor block should be updated to the reorg block header.
    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(reorgBlock.header)).toBe(true);
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

  describe('rollback on prune', () => {
    // The anchor must sit above the fork for the prune guard to let the rollback through, and the node must still
    // serve the fork point for the prune to find a header for the new anchor.
    const stagePruneTo = async (forkBlock: L2Block, anchorBlockNumber: BlockNumber) => {
      const anchorBlock = await L2Block.random(anchorBlockNumber);
      await anchorBlockStore.setHeader(anchorBlock.header);
      await serveBlock(forkBlock);
    };

    it('rolls every registered store back to the fork point, within the anchor update transaction', async () => {
      // A depth counter rather than a boolean: reading the anchor below opens its own nested transaction, which would
      // clear a boolean flag on the way out and make the enclosing prune transaction invisible.
      const realTransactionAsync = store.transactionAsync.bind(store);
      let transactionDepth = 0;
      jest.spyOn(store, 'transactionAsync').mockImplementation(async callback => {
        transactionDepth++;
        try {
          return await realTransactionAsync(callback);
        } finally {
          transactionDepth--;
        }
      });

      // Each rollback records the block it was handed, whether it ran inside the kv transaction, and the anchor as it
      // stood at that moment — still the pre-prune one, since the rollbacks must precede the anchor update.
      const rollbacks: { toBlock: number; inTransaction: boolean; anchorBlockNumber: number }[] = [];
      for (const rollbackable of rollbackables) {
        rollbackable.rollbackToBlock.mockImplementation(async toBlock => {
          const anchor = await anchorBlockStore.getBlockHeader();
          rollbacks.push({ toBlock, inTransaction: transactionDepth > 0, anchorBlockNumber: anchor.getBlockNumber() });
        });
      }

      const forkBlock = await L2Block.random(BlockNumber(3));
      await stagePruneTo(forkBlock, BlockNumber(5));

      await synchronizer.handleBlockStreamEvent(prunedEvent(await blockId(forkBlock)));

      expect(rollbacks).toEqual([
        { toBlock: 3, inTransaction: true, anchorBlockNumber: 5 },
        { toBlock: 3, inTransaction: true, anchorBlockNumber: 5 },
      ]);
      // Once the rollbacks were through, the anchor dropped to the fork point and the tips cursor followed it.
      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(3);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(3);
    });

    it('does not roll back on chain-finalized', async () => {
      // Configured to anchor on the finalized tip, so the event reaches the anchor update rather than being skipped
      // by the syncChainTip check before any handling runs.
      synchronizer = createSynchronizer({ syncChainTip: 'finalized' });
      const finalizedBlock = await L2Block.random(BlockNumber(9));
      getBlock.mockResolvedValue(await blockResponse(finalizedBlock));

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: makeL2BlockId(BlockNumber(9), (await finalizedBlock.hash()).toString()),
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
      });

      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(9);

      for (const rollbackable of rollbackables) {
        expect(rollbackable.rollbackToBlock).not.toHaveBeenCalled();
      }
    });

    it('undoes a failed prune, leaving the event to be re-emitted and applied on the next sync', async () => {
      // The note store rolls back first and succeeds; the store behind it then throws, so the note it deleted is only
      // restored if the whole prune shares one transaction.
      const failingStore = mock<Rollbackable>();
      failingStore.rollbackToBlock.mockRejectedValue(new Error('store rollback failed'));
      synchronizer = createSynchronizer({}, [noteStore, failingStore]);

      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();
      const forkBlock = await L2Block.random(BlockNumber(3));
      const orphanedNote = await noteAt(contract, makeL2BlockId(BlockNumber(4), Fr.random().toString()));
      noteStore.beginChangeSet('note-change-set');
      await noteStore.addNotes([orphanedNote], scope, 'note-change-set');
      await noteStore.commitChangeSet('note-change-set');

      await stagePruneTo(forkBlock, BlockNumber(5));

      await expect(synchronizer.handleBlockStreamEvent(prunedEvent(await blockId(forkBlock)))).rejects.toThrow(
        'store rollback failed',
      );

      // Nothing from the failed attempt stuck: the orphaned note is back, the anchor still sits above the fork, and
      // the tips cursor never advanced onto the prune target.
      const kept = await readNotes(noteStore, {
        contractAddress: contract,
        scopes: [scope],
        status: NoteStatus.ACTIVE,
      });
      expect(kept.map(note => note.l2BlockNumber)).toEqual([4]);
      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(5);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(0);

      // Because the cursor stayed put, the next sync re-emits the very same prune event. This time the failing store
      // recovers (say the node was restarted), so the reorg is processed to completion instead of being lost.
      failingStore.rollbackToBlock.mockResolvedValue(undefined);

      await synchronizer.handleBlockStreamEvent(prunedEvent(await blockId(forkBlock)));

      const afterReplay = await readNotes(noteStore, {
        contractAddress: contract,
        scopes: [scope],
        status: NoteStatus.ACTIVE,
      });
      expect(afterReplay).toEqual([]);
      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(3);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(3);
    });

    it('deletes rows above the fork when wired to a real store', async () => {
      synchronizer = createSynchronizer({}, [noteStore]);

      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Block 3 is the fork point (a real block the node still serves); block 4 is on the abandoned fork.
      const forkBlock = await L2Block.random(BlockNumber(3));
      const noteAtFork = await noteAt(contract, await blockId(forkBlock));
      const orphanedNote = await noteAt(contract, makeL2BlockId(BlockNumber(4), Fr.random().toString()));
      noteStore.beginChangeSet('note-change-set');
      await noteStore.addNotes([noteAtFork, orphanedNote], scope, 'note-change-set');
      await noteStore.commitChangeSet('note-change-set');

      await stagePruneTo(forkBlock, BlockNumber(5));

      await synchronizer.handleBlockStreamEvent(prunedEvent(await blockId(forkBlock)));

      const remaining = await readNotes(noteStore, {
        contractAddress: contract,
        scopes: [scope],
        status: NoteStatus.ACTIVE,
      });
      expect(remaining.map(note => note.l2BlockNumber)).toEqual([3]);
      expect(remaining[0].siloedNullifier.equals(noteAtFork.siloedNullifier)).toBe(true);
    });
  });

  describe('syncChainTip config', () => {
    it('updates anchor on chain-proposed when syncChainTip is proposed (default)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });
      const block = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent(await proposedEvent(block));

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(block.header)).toBe(true);
    });

    it('does not update anchor on chain-proposed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // First set a known anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // chain-proposed should NOT update the anchor in checkpointed mode
      const newBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent(await proposedEvent(newBlock));

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('updates anchor on chain-checkpointed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // Set initial anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // The checkpointed tip block, fetched by hash from the node when the thin event arrives.
      const checkpointBlock = await L2Block.random(BlockNumber(1));
      const checkpointBlockHash = await checkpointBlock.hash();
      aztecNode.getBlockData.mockImplementation(query =>
        Promise.resolve(
          query instanceof BlockHash && query.equals(checkpointBlockHash)
            ? ({
                header: checkpointBlock.header,
                archive: checkpointBlock.archive,
                blockHash: checkpointBlockHash,
                checkpointNumber: checkpointBlock.checkpointNumber,
                indexWithinCheckpoint: checkpointBlock.indexWithinCheckpoint,
              } as BlockData)
            : undefined,
        ),
      );

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(1), hash: checkpointBlockHash.toString() },
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
      });

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(checkpointBlock.header)).toBe(true);
    });

    it('skips the anchor update on chain-checkpointed when the block was reorged out (missing by hash)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // The node no longer serves the checkpointed block at that hash (transient reorg).
      aztecNode.getBlockData.mockResolvedValue(undefined);

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(1), hash: Fr.random().toString() },
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
      });

      // Anchor is left untouched; a later event corrects it.
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(initialBlock.header)).toBe(true);
    });

    it('does not update anchor on chain-checkpointed when syncChainTip is proposed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });

      // Set initial anchor via the proposed tip
      const initialBlock = await L2Block.random(BlockNumber(1));
      await synchronizer.handleBlockStreamEvent(await proposedEvent(initialBlock));

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(1), hash: '0x456' },
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
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
      getBlock.mockResolvedValue(await blockResponse(provenBlock));

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(5), hash: '0x789' },
        checkpoint: { number: CheckpointNumber(1), hash: '0x789c' },
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
      getBlock.mockResolvedValue(await blockResponse(finalizedBlock));

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: { number: BlockNumber(10), hash: '0xabc' },
        checkpoint: { number: CheckpointNumber(2), hash: '0xabcc' },
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
      await synchronizer.handleBlockStreamEvent(prunedEvent({ number: BlockNumber(3), hash: '0x3' }));

      // Anchor should be unchanged, and no store was rolled back
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
      for (const rollbackable of rollbackables) {
        expect(rollbackable.rollbackToBlock).not.toHaveBeenCalled();
      }
    });
  });

  // These exercise a real (non-mocked) L2BlockStream wired to the mocked node, so they cover the tips-only
  // wiring end to end: the stream polls getChainTips, fetches the proposed tip's header through its source
  // adapter (node.getBlock by hash), and the synchronizer anchors on the header carried by chain-proposed — never
  // downloading block payloads via getBlocks. The local store is pre-seeded at block 1 (anchor + proposed tip) so
  // the walk-back terminates there without touching genesis, and the source advances the proposed tip to block 2.
  describe('tips-only stream sync', () => {
    let realSynchronizer: BlockSynchronizer;
    let block1: L2Block;
    let block2: L2Block;
    let block2Hash: BlockHash;
    let serveBlock: (param: Parameters<AztecNode['getBlock']>[0]) => Promise<BlockResponse | undefined>;

    // The L2Tips snapshot the stream reads: proposed at block 2, every confirmed tier still at block 1.
    const tipsAtBlock2 = async () => {
      const tip1 = {
        block: makeL2BlockId(block1.number, (await block1.hash()).toString()),
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
      };
      return {
        proposed: makeL2BlockId(block2.number, block2Hash.toString()),
        checkpointed: tip1,
        proven: tip1,
        finalized: tip1,
      };
    };

    beforeEach(async () => {
      block1 = await L2Block.random(BlockNumber(1));
      block2 = await L2Block.random(BlockNumber(2));
      block2Hash = await block2.hash();
      const block1Hash = await block1.hash();

      // Pre-seed the local store at block 1: the anchor header and the proposed-tip walk-back history.
      await anchorBlockStore.setHeader(block1.header);
      await tipsStore.handleBlockStreamEvent({
        type: 'chain-proposed',
        block: makeL2BlockId(block1.number, block1Hash.toString()),
        header: block1.header,
      });

      // The stream's source adapter serves both its reads via node.getBlock: the walk-back hash for block 1 by
      // number, and the proposed tip's header for block 2 by hash.
      aztecNode.getChainTips.mockResolvedValue(await tipsAtBlock2());
      const block1Response = await blockResponse(block1);
      const block2Response = await blockResponse(block2);
      serveBlock = param => {
        if (typeof param === 'object' && 'number' in param && param.number === block1.number) {
          return Promise.resolve(block1Response);
        }
        if (typeof param === 'object' && 'hash' in param && param.hash.equals(block2Hash)) {
          return Promise.resolve(block2Response);
        }
        return Promise.resolve(undefined);
      };
      getBlock.mockImplementation(serveBlock);

      realSynchronizer = new BlockSynchronizer(
        withCache(aztecNode),
        store,
        anchorBlockStore,
        rollbackables,
        tipsStore,
        contractSyncService,
        { syncChainTip: 'proposed' },
      );
    });

    afterEach(async () => {
      await realSynchronizer.stop();
    });

    it('anchors on the proposed tip from the stream-supplied header without downloading blocks', async () => {
      await realSynchronizer.sync();

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.getBlockNumber()).toBe(2);
      expect(obtainedHeader.equals(block2.header)).toBe(true);
      expect(aztecNode.getBlocks).not.toHaveBeenCalled();
      // The synchronizer performs no fetch of its own: the tip's header arrived on the chain-proposed event.
      expect(aztecNode.getBlockData).not.toHaveBeenCalled();
    });

    it('retries on the next sync when the proposed tip header cannot be obtained', async () => {
      // Hash queries fail, so the stream cannot obtain the proposed tip's header and skips the whole pass: the
      // anchor AND the proposed cursor stay at block 1.
      getBlock.mockImplementation(param =>
        typeof param === 'object' && 'hash' in param ? Promise.resolve(undefined) : serveBlock(param),
      );

      await realSynchronizer.sync();
      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(1);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(1);

      // Because the cursor did not advance, the next sync re-detects the tip movement; with the node serving
      // again, the anchor lands at block 2.
      getBlock.mockImplementation(serveBlock);
      await realSynchronizer.sync();
      expect((await anchorBlockStore.getBlockHeader()).equals(block2.header)).toBe(true);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(2);
    });

    it('re-emits the proposed tip on the next sync when the first anchor update throws', async () => {
      // The anchor write throws on its first attempt to block 2 only. Because the tips store is advanced AFTER the
      // anchor update, the throw leaves the proposed cursor at block 1, so the next sync re-emits chain-proposed for
      // block 2 and the anchor lands. (The stream's work() loop logs the handler throw rather than rejecting sync().)
      const originalSetHeader = anchorBlockStore.setHeader.bind(anchorBlockStore);
      let firstAnchorToBlock2 = true;
      anchorBlockStore.setHeader = async header => {
        if (header.getBlockNumber() === 2 && firstAnchorToBlock2) {
          firstAnchorToBlock2 = false;
          throw new Error('transient anchor write failure');
        }
        await originalSetHeader(header);
      };

      // First sync: the anchor write throws, so the anchor stays at block 1 and the proposed cursor does not advance.
      await realSynchronizer.sync();
      expect((await anchorBlockStore.getBlockHeader()).getBlockNumber()).toBe(1);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(1);

      // Second sync: chain-proposed is re-emitted for block 2, the anchor write succeeds, and the cursor advances.
      await realSynchronizer.sync();
      expect((await anchorBlockStore.getBlockHeader()).equals(block2.header)).toBe(true);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(2);
    });
  });
});
