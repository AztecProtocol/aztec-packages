import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
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
  type L2BlockStreamEvent,
  makeL2BlockId,
  makeL2CheckpointId,
} from '@aztec/stdlib/block';
import type { AztecNode, BlockResponse } from '@aztec/stdlib/interfaces/client';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { BlockSynchronizerConfig } from '../config/index.js';
import type { ContractSyncService } from '../contract_sync/contract_sync_service.js';
import { AnchorBlockStore } from '../storage/anchor_block_store/anchor_block_store.js';
import { EntityStore } from '../storage/entity_store/entity_store.js';
import { EntityKey, EntityTypeKey } from '../storage/entity_store/entity_store_keys.js';
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

  // Builds the BlockData the node returns from getBlockData for a block (chain-proposed/checkpointed handlers
  // fetch the tip header by hash through this path).
  const blockData = async (block: L2Block): Promise<BlockData> => ({
    header: block.header,
    archive: block.archive,
    blockHash: await block.hash(),
    checkpointNumber: block.checkpointNumber,
    indexWithinCheckpoint: block.indexWithinCheckpoint,
  });

  // Mocks node.getBlockData to serve the given block only when queried by its own hash (mirrors the by-hash
  // fetch the chain-proposed handler performs); any other query resolves undefined.
  const serveBlockDataByHash = async (block: L2Block) => {
    const data = await blockData(block);
    aztecNode.getBlockData.mockImplementation(param =>
      Promise.resolve(param instanceof BlockHash && param.equals(data.blockHash) ? data : undefined),
    );
    return data;
  };

  // Emits a chain-proposed tip event for the given block (the tip event PXE anchors on in proposed mode).
  const proposedEvent = async (block: L2Block): Promise<L2BlockStreamEvent> => ({
    type: 'chain-proposed',
    block: makeL2BlockId(block.number, (await block.hash()).toString()),
  });

  it('sets header from the proposed tip', async () => {
    const block = await L2Block.random(BlockNumber(1));
    await serveBlockDataByHash(block);
    await synchronizer.handleBlockStreamEvent(await proposedEvent(block));

    const obtainedHeader = await anchorBlockStore.getBlockHeader();
    expect(obtainedHeader.equals(block.header)).toBe(true);
  });

  it('updates anchor block on a reorg', async () => {
    const reorgBlock = await L2Block.random(BlockNumber(3));
    await serveBlock(reorgBlock);

    // Anchor sits above the prune target so the prune guard lets the rollback through.
    const anchorBlock = await L2Block.random(BlockNumber(4));
    await anchorBlockStore.setHeader(anchorBlock.header);

    await synchronizer.handleBlockStreamEvent({
      type: 'chain-pruned',
      block: await blockId(reorgBlock),
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
      const block4 = makeL2BlockId(BlockNumber(4), Fr.random().toString());
      const block5 = makeL2BlockId(BlockNumber(5), Fr.random().toString());

      // Seed a note at each block, anchored to that block's id.
      const noteAt3 = await noteAt(contract, await blockId(forkBlock));
      const noteAt4 = await noteAt(contract, block4);
      const noteAt5 = await noteAt(contract, block5);
      await noteStore.addNotes([noteAt3, noteAt4, noteAt5], scope, 'note-job');
      await noteStore.commit('note-job');

      // Seed an event at each block.
      const eventIdAt3 = Fr.random();
      const eventIdAt4 = Fr.random();
      const eventIdAt5 = Fr.random();
      await storeEvent(contract, scope, eventIdAt3, await blockId(forkBlock));
      await storeEvent(contract, scope, eventIdAt4, block4);
      await storeEvent(contract, scope, eventIdAt5, block5);
      await privateEventStore.commit('event-job');

      // Set the anchor to block 5 so the prune guard passes.
      const anchorBlock5 = await L2Block.random(BlockNumber(5));
      await anchorBlockStore.setHeader(anchorBlock5.header);

      // The node serves the fork-point block; it becomes the new anchor after the prune.
      await serveBlock(forkBlock);

      // Prune back to block 3 (orphaning blocks 4 and 5).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: await blockId(forkBlock),
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

    it('chain-pruned retracts retractable entity at pruned block heights or above', async () => {
      const jobId = 'entity-job';

      // Block 5 will be the fork point: the prune keeps it and abandons only blocks strictly above it.
      const lastSurvivingBlock = await L2Block.random(BlockNumber(5));

      const contractAddress = await AztecAddress.random();
      const scope = await AztecAddress.random();

      const entityTypeId = Fr.random();

      const survivingEntityId = Fr.random();
      const survivingEntityKey = EntityKey.from({
        contractAddress,
        scope,
        entityTypeId,
        entityId: survivingEntityId,
      });

      // A retractable entity originating exactly at the fork point: the fork point is kept, so it must survive.
      await entityStore.createEntity(
        survivingEntityKey,
        [Fr.random()],
        {
          blockNumber: lastSurvivingBlock.number,
          blockHash: (await lastSurvivingBlock.hash()).toFr(),
        },
        jobId,
      );

      const retractedEntityId = Fr.random();
      const retractedEntityKey = EntityKey.from({
        contractAddress: contractAddress,
        scope,
        entityTypeId,
        entityId: retractedEntityId,
      });

      // A retractable entity originating just above the fork, carrying a non-retractable fact: the prune must delete
      // the entity, taking said non-retractable fact with it.
      await entityStore.createEntity(
        retractedEntityKey,
        [Fr.random()],
        { blockNumber: lastSurvivingBlock.number + 1, blockHash: Fr.random() },
        jobId,
      );
      await entityStore.recordFact(retractedEntityKey, Fr.random(), [Fr.random()], undefined, jobId);

      await store.transactionAsync(() => entityStore.commit(jobId));

      // Both entities must be present before the prune.
      expect(
        await entityStore.getEntities(EntityTypeKey.from({ contractAddress, scope, entityTypeId }), jobId),
      ).toHaveLength(2);
      await store.transactionAsync(() => entityStore.commit(jobId));

      // Some blocks later...
      const anchorBlock10 = await L2Block.random(BlockNumber(10));
      await anchorBlockStore.setHeader(anchorBlock10.header);

      // The node serves the fork-point block (number 5), so it becomes the new anchor after the prune.
      await serveBlock(lastSurvivingBlock);

      // Prune back to block 5, dropping block 6 where the retractable entity originates.
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: await blockId(lastSurvivingBlock),
        checkpointed: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
        proven: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
      });

      // Only the fork-point entity survives. The one originating above the fork is gone.
      const entities = await entityStore.getEntities(
        EntityTypeKey.from({ contractAddress, scope, entityTypeId }),
        jobId,
      );
      expect(entities).toHaveLength(1);
      expect(entities[0].key.entityId.equals(survivingEntityId)).toBe(true);
      expect(await entityStore.getEntity(retractedEntityKey, jobId)).toBeUndefined();
      expect((await entityStore.getEntity(survivingEntityKey, jobId))!.facts).toHaveLength(0);
    });

    it('chain-pruned keeps a non-retractable entity and its facts up to the fork point, deleting only those above it', async () => {
      const jobId = 'entity-job';

      // Block 5 is the fork point: the prune keeps it and abandons only blocks strictly above it.
      const lastSurvivingBlock = await L2Block.random(BlockNumber(5));

      const contractAddress = await AztecAddress.random();
      const scope = await AztecAddress.random();

      const entityTypeId = Fr.random();
      const entityId = Fr.random();
      const retractedFactType = Fr.random();
      const forkPointFactType = Fr.random();
      const nonRetractableFactType = Fr.random();

      const entityKey = EntityKey.from({ contractAddress, scope, entityTypeId, entityId });

      // A non-retractable entity carrying three facts: a non-retractable one, a retractable one anchored to the fork
      // point (block 5), and a retractable one originating just above it (block 6). The prune must keep the entity, its
      // non-retractable fact, and the fork-point fact, deleting only the orphaned fact.
      await entityStore.createEntity(entityKey, [Fr.random()], undefined, jobId);
      await entityStore.recordFact(entityKey, nonRetractableFactType, [Fr.random()], undefined, jobId);
      await entityStore.recordFact(
        entityKey,
        forkPointFactType,
        [],
        {
          blockNumber: lastSurvivingBlock.number,
          blockHash: (await lastSurvivingBlock.hash()).toFr(),
        },
        jobId,
      );
      await entityStore.recordFact(
        entityKey,
        retractedFactType,
        [],
        { blockNumber: lastSurvivingBlock.number + 1, blockHash: Fr.random() },
        jobId,
      );
      await store.transactionAsync(() => entityStore.commit(jobId));

      // The entity and all three facts must be present before the prune.
      expect(
        await entityStore.getEntities(EntityTypeKey.from({ contractAddress, scope, entityTypeId }), jobId),
      ).toHaveLength(1);
      expect((await entityStore.getEntity(entityKey, jobId))!.facts).toHaveLength(3);

      await store.transactionAsync(() => entityStore.commit(jobId));

      // Some blocks later...
      const anchorBlock10 = await L2Block.random(BlockNumber(10));
      await anchorBlockStore.setHeader(anchorBlock10.header);

      // The node serves the fork-point block, so it becomes the new anchor after the prune.
      await serveBlock(lastSurvivingBlock);

      // Prune back to block 5, orphaning block 6 where the retractable fact originates.
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: await blockId(lastSurvivingBlock),
        checkpointed: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
        proven: {
          block: makeL2BlockId(BlockNumber.ZERO, GENESIS_BLOCK_HEADER_HASH.toString()),
          checkpoint: makeL2CheckpointId(CheckpointNumber.ZERO, GENESIS_CHECKPOINT_HEADER_HASH.toString()),
        },
      });

      // The non-retractable entity survives, keeping its non-retractable fact and the fork-point fact. Only the fact
      // originating above the fork is gone.
      const entities = await entityStore.getEntities(
        EntityTypeKey.from({ contractAddress: contractAddress, scope, entityTypeId }),
        jobId,
      );
      expect(entities).toHaveLength(1);
      expect(entities[0].key.entityId.equals(entityId)).toBe(true);

      const remainingFactTypes = (await entityStore.getEntity(entityKey, jobId))!.facts.map(fact => fact.factTypeId);
      expect(remainingFactTypes).toHaveLength(2);
      expect(remainingFactTypes.some(factType => factType.equals(nonRetractableFactType))).toBe(true);
      expect(remainingFactTypes.some(factType => factType.equals(forkPointFactType))).toBe(true);
      expect(remainingFactTypes.some(factType => factType.equals(retractedFactType))).toBe(false);
    });

    it('notes below the fork survive and remain queryable after a prune', async () => {
      const contract = await AztecAddress.random();
      const scope = await AztecAddress.random();

      // Block 1 is the fork point (a real block the node still serves); 2 and 3 are on the abandoned fork.
      const forkBlock = await L2Block.random(BlockNumber(1));
      const block2 = makeL2BlockId(BlockNumber(2), Fr.random().toString());
      const block3 = makeL2BlockId(BlockNumber(3), Fr.random().toString());

      const noteAt1 = await noteAt(contract, await blockId(forkBlock));
      const noteAt2 = await noteAt(contract, block2);
      const noteAt3 = await noteAt(contract, block3);
      await noteStore.addNotes([noteAt1, noteAt2, noteAt3], scope, 'note-job');
      await noteStore.commit('note-job');

      // Anchor at block 3.
      const anchorBlock3 = await L2Block.random(BlockNumber(3));
      await anchorBlockStore.setHeader(anchorBlock3.header);

      // The node serves the fork-point block; it becomes the new anchor after the prune.
      await serveBlock(forkBlock);

      // Prune back to block 1 (orphaning blocks 2 and 3).
      await synchronizer.handleBlockStreamEvent({
        type: 'chain-pruned',
        block: await blockId(forkBlock),
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
    it('updates anchor on chain-proposed when syncChainTip is proposed (default)', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });
      const block = await L2Block.random(BlockNumber(1));
      await serveBlockDataByHash(block);
      await synchronizer.handleBlockStreamEvent(await proposedEvent(block));

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.equals(block.header)).toBe(true);
    });

    it('throws and keeps the cursor retryable on chain-proposed when the block is missing by hash', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'proposed' });

      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      const proposedBlock = await L2Block.random(BlockNumber(1));
      const proposedHash = await proposedBlock.hash();
      const event: L2BlockStreamEvent = {
        type: 'chain-proposed',
        block: makeL2BlockId(proposedBlock.number, proposedHash.toString()),
      };

      // The node cannot return the proposed block's data (node inconsistency). The handler must throw rather than
      // warn-and-skip, so the tips-store cursor below it never advances and the next delivery can retry.
      aztecNode.getBlockData.mockResolvedValue(undefined);
      await expect(synchronizer.handleBlockStreamEvent(event)).rejects.toThrow(/not found/);

      // Anchor is left untouched and the proposed cursor did NOT advance: a quiet chain re-emits the same event.
      expect((await anchorBlockStore.getBlockHeader()).equals(initialBlock.header)).toBe(true);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(0);

      // The block becomes available; re-delivering the same event now lands the anchor and advances the cursor.
      await serveBlockDataByHash(proposedBlock);
      await synchronizer.handleBlockStreamEvent(event);
      expect((await anchorBlockStore.getBlockHeader()).equals(proposedBlock.header)).toBe(true);
      expect((await tipsStore.getL2Tips()).proposed.number).toBe(1);
    });

    it('does not update anchor on chain-proposed when syncChainTip is checkpointed', async () => {
      synchronizer = createSynchronizer({ syncChainTip: 'checkpointed' });

      // First set a known anchor
      const initialBlock = await L2Block.random(BlockNumber(0));
      await anchorBlockStore.setHeader(initialBlock.header);

      // chain-proposed should NOT update the anchor in checkpointed mode
      const newBlock = await L2Block.random(BlockNumber(1));
      await serveBlockDataByHash(newBlock);
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
      await serveBlockDataByHash(initialBlock);
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

  // These exercise a real (non-mocked) L2BlockStream wired to the mocked node, so they cover the tips-only
  // wiring end to end: the stream polls getChainTips, emits chain-proposed, and the synchronizer anchors by
  // fetching the tip header by hash — never downloading block payloads via getBlocks. The local store is pre-seeded
  // at block 1 (anchor + proposed tip) so the walk-back terminates there without touching genesis, and the source
  // advances the proposed tip to block 2.
  describe('tips-only stream sync', () => {
    let realSynchronizer: BlockSynchronizer;
    let block1: L2Block;
    let block2: L2Block;
    let block2Hash: BlockHash;

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
      const block2Data = await blockData(block2);

      // Pre-seed the local store at block 1: the anchor header and the proposed-tip walk-back history.
      await anchorBlockStore.setHeader(block1.header);
      await tipsStore.handleBlockStreamEvent({
        type: 'chain-proposed',
        block: makeL2BlockId(block1.number, block1Hash.toString()),
      });

      // The stream's source adapter resolves the walk-back hash for block 1 via node.getBlock({ number: 1 }),
      // while the synchronizer fetches the proposed tip header for block 2 via node.getBlockData(block2Hash).
      aztecNode.getChainTips.mockResolvedValue(await tipsAtBlock2());
      const block1Response = await blockResponse(block1);
      getBlock.mockImplementation(param =>
        Promise.resolve(
          typeof param === 'object' && 'number' in param && param.number === block1.number ? block1Response : undefined,
        ),
      );
      aztecNode.getBlockData.mockImplementation(param =>
        Promise.resolve(param instanceof BlockHash && param.equals(block2Hash) ? block2Data : undefined),
      );

      realSynchronizer = new BlockSynchronizer(
        aztecNode,
        store,
        anchorBlockStore,
        noteStore,
        privateEventStore,
        tipsStore,
        contractSyncService,
        { syncChainTip: 'proposed' },
      );
    });

    afterEach(async () => {
      await realSynchronizer.stop();
    });

    it('anchors on the proposed tip via a by-hash fetch without downloading blocks', async () => {
      await realSynchronizer.sync();

      const obtainedHeader = await anchorBlockStore.getBlockHeader();
      expect(obtainedHeader.getBlockNumber()).toBe(2);
      expect(obtainedHeader.equals(block2.header)).toBe(true);
      expect(aztecNode.getBlocks).not.toHaveBeenCalled();
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
