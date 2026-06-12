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
  type L2BlockId,
  type L2BlockStream,
  makeL2BlockId,
  makeL2CheckpointId,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode, BlockResponse } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { EntityKey, EntityTypeKey } from '../storage/entity_store/entity_keys.js';
import { EntityStore } from '../storage/entity_store/entity_store.js';
import { NoteStore } from '../storage/note_store/note_store.js';
import { PrivateEventStore } from '../storage/private_event_store/private_event_store.js';
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
  let privateEventStore: PrivateEventStore;
  let entityStore: EntityStore;
  let aztecNode: MockProxy<AztecNode>;
  let getBlock: NodeGetBlockMock;
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
      entityStore,
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

  // Builds a note DAO anchored to the given block id (caller adds it to the store and commits).
  const noteAt = (contract: AztecAddress, block: L2BlockId): Promise<NoteDao> =>
    NoteDao.random({ contractAddress: contract, l2BlockNumber: block.number, l2BlockHash: block.hash });

  // Stores one private event anchored to the given block id under the 'event-job' (caller commits).
  const storeEvent = (contract: AztecAddress, scope: AztecAddress, eventId: Fr, block: L2BlockId) =>
    privateEventStore.storePrivateEventLog(
      EventSelector.random(),
      Fr.random(),
      [Fr.random()],
      eventId,
      {
        contractAddress: contract,
        scope,
        txHash: TxHash.random(),
        l2BlockNumber: block.number,
        l2BlockHash: BlockHash.fromString(block.hash),
        txIndexInBlock: 0,
        eventIndexInTx: 0,
      },
      'event-job',
    );

  beforeEach(async () => {
    store = await openTmpStore('test');
    blockStream = mock<L2BlockStream>();
    aztecNode = mock<AztecNode>();
    getBlock = aztecNode.getBlock as NodeGetBlockMock;
    tipsStore = new L2TipsKVStore(store, 'pxe', GENESIS_BLOCK_HEADER_HASH);
    anchorBlockStore = new AnchorBlockStore(store);
    noteStore = new NoteStore(store);
    privateEventStore = new PrivateEventStore(store);
    entityStore = new EntityStore(store);
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
    const reorgBlock = await L2Block.random(BlockNumber(3));
    const reorgResponse = await blockResponse(reorgBlock);
    getBlock.mockImplementation(param =>
      Promise.resolve(param instanceof BlockHash && param.equals(reorgResponse.hash) ? reorgResponse : undefined),
    );

    await synchronizer.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: await timesParallel(5, i => L2Block.random(BlockNumber(i))),
    });
    await synchronizer.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: makeL2BlockId(reorgBlock.number, reorgResponse.hash.toString()),
      checkpointed: {
        block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
        checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
      },
      proven: {
        block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
        checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
      },
    });

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

  describe('delete-on-prune', () => {
    it('chain-pruned deletes rows anchored above the fork and keeps rows at or below it', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Block 3 is the fork point (a real block the node still serves); 4 and 5 are on the abandoned fork.
      const forkBlock = await L2Block.random(BlockNumber(3));
      const block3 = makeL2BlockId(forkBlock.number, (await forkBlock.hash()).toString());
      const block4 = makeL2BlockId(BlockNumber(4), Fr.random().toString());
      const block5 = makeL2BlockId(BlockNumber(5), Fr.random().toString());

      // Seed a note at each block, anchored to that block's id.
      const noteAt3 = await noteAt(contract, block3);
      const noteAt4 = await noteAt(contract, block4);
      const noteAt5 = await noteAt(contract, block5);
      await noteStore.addNotes([noteAt3, noteAt4, noteAt5], scope, 'note-job');
      await noteStore.commit('note-job');

      // Seed an event at each block.
      const eventIdAt3 = Fr.random();
      const eventIdAt4 = Fr.random();
      const eventIdAt5 = Fr.random();
      await storeEvent(contract, scope, eventIdAt3, block3);
      await storeEvent(contract, scope, eventIdAt4, block4);
      await storeEvent(contract, scope, eventIdAt5, block5);
      await privateEventStore.commit('event-job');

      // Set the anchor to block 5 so the prune guard passes.
      const anchorBlock5 = await L2Block.random(BlockNumber(5));
      await anchorBlockStore.setHeader(anchorBlock5.header);

      // The node serves the fork-point block; it becomes the new anchor after the prune.
      const forkResponse = await blockResponse(forkBlock);
      getBlock.mockImplementation(param =>
        Promise.resolve(param instanceof BlockHash && param.equals(forkResponse.hash) ? forkResponse : undefined),
      );

      // Prune back to block 3 (orphaning blocks 4 and 5).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: block3,
        checkpointed: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
        proven: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
      });

      // Rows at blocks 4 and 5 must be gone.
      expect(await noteStore.nullifiersOfNotesAtBlock(4)).toHaveLength(0);
      expect(await noteStore.nullifiersOfNotesAtBlock(5)).toHaveLength(0);
      expect(await privateEventStore.eventIdsAtBlock(4)).toHaveLength(0);
      expect(await privateEventStore.eventIdsAtBlock(5)).toHaveLength(0);

      // Rows at block 3 (the fork point, not an orphan) must survive.
      expect(await noteStore.nullifiersOfNotesAtBlock(3)).toEqual([noteAt3.siloedNullifier.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(3)).toEqual([eventIdAt3.toString()]);
    });

    it('chain-finalized does not delete any rows', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Canonical rows at two heights: one below the finalized block, one at it.
      const block8 = makeL2BlockId(BlockNumber(8), Fr.random().toString());
      const block9 = makeL2BlockId(BlockNumber(9), Fr.random().toString());
      const note8 = await noteAt(contract, block8);
      const note9 = await noteAt(contract, block9);
      await noteStore.addNotes([note8, note9], scope, 'note-job');
      await noteStore.commit('note-job');

      const eventId8 = Fr.random();
      const eventId9 = Fr.random();
      await storeEvent(contract, scope, eventId8, block8);
      await storeEvent(contract, scope, eventId9, block9);
      await privateEventStore.commit('event-job');

      await synchronizer.handleBlockStreamEvent({
        type: 'chain-finalized',
        block: block9,
        checkpoint: makeL2CheckpointId(CheckpointNumber(1), Fr.random().toString()),
      });

      // Finalization is a no-op for storage under delete-on-prune, every row at and below the tip survives.
      expect(await noteStore.nullifiersOfNotesAtBlock(8)).toEqual([note8.siloedNullifier.toString()]);
      expect(await noteStore.nullifiersOfNotesAtBlock(9)).toEqual([note9.siloedNullifier.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(8)).toEqual([eventId8.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(9)).toEqual([eventId9.toString()]);
    });

    it('chain-pruned deletes entities and facts originating above the fork, keeps non-retractable ones', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();
      const entityTypeId = Fr.random();
      const prunedEntityId = Fr.random();
      const survivingEntityId = Fr.random();
      const retractableFactType = Fr.random();
      const nonRetractableFactType = Fr.random();
      const jobId = 'entity-job';

      // Block 5 is the fork point; block 10 is on the abandoned fork (above the fork).
      const forkBlock = await L2Block.random(BlockNumber(5));
      const block5 = makeL2BlockId(forkBlock.number, (await forkBlock.hash()).toString());
      const orphanedOriginBlock = { blockNumber: 10, blockHash: Fr.random() };

      const prunedKey = EntityKey.from({ contractAddress: contract, scope, entityTypeId, entityId: prunedEntityId });
      const survivingKey = EntityKey.from({
        contractAddress: contract,
        scope,
        entityTypeId,
        entityId: survivingEntityId,
      });

      // A retractable entity originating on the abandoned fork: the prune must delete it wholesale, taking even its
      // non-retractable fact with it.
      await entityStore.createEntity(prunedKey, [Fr.random()], orphanedOriginBlock, jobId);
      await entityStore.recordFact(prunedKey, nonRetractableFactType, [Fr.random()], undefined, jobId);

      // A non-retractable entity: the prune must keep it, deleting only its fact originating on the abandoned fork.
      await entityStore.createEntity(survivingKey, [Fr.random()], undefined, jobId);
      await entityStore.recordFact(survivingKey, nonRetractableFactType, [Fr.random()], undefined, jobId);
      await entityStore.recordFact(survivingKey, retractableFactType, [], orphanedOriginBlock, jobId);
      await store.transactionAsync(() => entityStore.commit(jobId));

      // Both entities and all their facts must be present before the prune.
      expect(
        await entityStore.getEntities(EntityTypeKey.from({ contractAddress: contract, scope, entityTypeId }), jobId),
      ).toHaveLength(2);
      expect((await entityStore.getEntity(prunedKey, jobId)).facts).toHaveLength(1);
      expect((await entityStore.getEntity(survivingKey, jobId)).facts).toHaveLength(2);

      // Set the anchor to block 10 so the prune guard passes (anchor is above the fork point).
      const anchorBlock10 = await L2Block.random(BlockNumber(10));
      await anchorBlockStore.setHeader(anchorBlock10.header);

      // The node serves the fork-point block; it becomes the new anchor after the prune.
      const forkResponse = await blockResponse(forkBlock);
      getBlock.mockImplementation(param =>
        Promise.resolve(param instanceof BlockHash && param.equals(forkResponse.hash) ? forkResponse : undefined),
      );

      // Prune back to block 5, orphaning block 10 where the retractable records originate.
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: block5,
        checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
      });

      // The retractable entity is gone wholesale; the non-retractable one keeps only its non-retractable fact.
      const active = await entityStore.getEntities(
        EntityTypeKey.from({ contractAddress: contract, scope, entityTypeId }),
        jobId,
      );
      expect(active).toHaveLength(1);
      expect(active[0].key.entityId.equals(survivingEntityId)).toBe(true);
      expect((await entityStore.getEntity(prunedKey, jobId)).facts).toHaveLength(0);
      const remaining = (await entityStore.getEntity(survivingKey, jobId)).facts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].factTypeId.equals(nonRetractableFactType)).toBe(true);
    });

    it('notes below the fork survive and remain queryable after a prune', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Block 1 is the fork point (a real block the node still serves); 2 and 3 are on the abandoned fork.
      const forkBlock = await L2Block.random(BlockNumber(1));
      const block1 = makeL2BlockId(forkBlock.number, (await forkBlock.hash()).toString());
      const block2 = makeL2BlockId(BlockNumber(2), Fr.random().toString());
      const block3 = makeL2BlockId(BlockNumber(3), Fr.random().toString());

      const noteAt1 = await noteAt(contract, block1);
      const noteAt2 = await noteAt(contract, block2);
      const noteAt3 = await noteAt(contract, block3);
      await noteStore.addNotes([noteAt1, noteAt2, noteAt3], scope, 'note-job');
      await noteStore.commit('note-job');

      // Anchor at block 3.
      const anchorBlock3 = await L2Block.random(BlockNumber(3));
      await anchorBlockStore.setHeader(anchorBlock3.header);

      // The node serves the fork-point block; it becomes the new anchor after the prune.
      const forkResponse = await blockResponse(forkBlock);
      getBlock.mockImplementation(param =>
        Promise.resolve(param instanceof BlockHash && param.equals(forkResponse.hash) ? forkResponse : undefined),
      );

      // Prune back to block 1 (orphaning blocks 2 and 3).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: block1,
        checkpointed: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
        proven: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
      });

      // Blocks 2 and 3 deleted.
      expect(await noteStore.nullifiersOfNotesAtBlock(2)).toHaveLength(0);
      expect(await noteStore.nullifiersOfNotesAtBlock(3)).toHaveLength(0);

      // Block 1 note still present and visible via getNotes.
      expect(await noteStore.nullifiersOfNotesAtBlock(1)).toEqual([noteAt1.siloedNullifier.toString()]);
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
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: { number: BlockNumber(3), hash: '0x3' },
        checkpointed: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
        proven: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
      });

      // Anchor should be unchanged
      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(anchorBlock.header)).toBe(true);
    });
  });
});
