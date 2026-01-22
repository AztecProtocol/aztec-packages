import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2BlockNew } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { makeStateReference } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import { InitialBlockNumberNotSequentialError } from './errors.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { KVArchiverDataStore } from './store/kv_archiver_store.js';
import { makeChainedCheckpoints } from './test/mock_structs.js';

describe('Archiver Store', () => {
  const rollupAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashFactoryAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();

  let publicClient: MockProxy<ViemPublicClient>;
  let debugClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobClient: MockProxy<BlobClientInterface>;
  let epochCache: MockProxy<EpochCache>;
  let archiverStore: KVArchiverDataStore;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let archiver: Archiver;

  beforeEach(async () => {
    const now = +new Date();

    publicClient = mock<ViemPublicClient>();
    debugClient = publicClient;
    blobClient = mock<BlobClientInterface>();
    epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    const rollupContract = mock<RollupContract>();
    Object.defineProperty(rollupContract, 'address', { value: rollupAddress.toString(), writable: true });

    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });

    const logger = createLogger('archiver:store:test');

    archiverStore = new KVArchiverDataStore(await openTmpStore('archiver_test', logger), logger, 1000, {
      epochDuration: 4,
    });

    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };

    const contractAddresses = {
      registryAddress,
      governanceProposerAddress,
      slashFactoryAddress,
      slashingProposerAddress,
    };

    const config = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
    };

    const events = new EventEmitter() as ArchiverEmitter;
    const synchronizer = mock<ArchiverL1Synchronizer>();

    archiver = new Archiver(
      publicClient,
      debugClient,
      rollupContract,
      contractAddresses,
      archiverStore,
      config,
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
      logger,
    );
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  describe('getPublishedCheckpoints', () => {
    it('returns published checkpoints with full checkpoint data', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 10);

      expect(result.length).toBe(3);
      expect(result.map(c => c.checkpoint.number)).toEqual([1, 2, 3]);
      result.forEach((pc, i) => {
        expect(pc.checkpoint.blocks.length).toBeGreaterThan(0);
        expect(pc.checkpoint.archive.root.toString()).toEqual(testCheckpoints[i].checkpoint.archive.root.toString());
        expect(pc.l1).toBeDefined();
      });
    });

    it('respects the limit parameter', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 2);

      expect(result.length).toBe(2);
      expect(result.map(c => c.checkpoint.number)).toEqual([1, 2]);
    });

    it('respects the starting checkpoint number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getPublishedCheckpoints(CheckpointNumber(2), 10);

      expect(result.length).toBe(2);
      expect(result.map(c => c.checkpoint.number)).toEqual([2, 3]);
    });

    it('returns empty array when no checkpoints exist', async () => {
      const result = await archiver.getPublishedCheckpoints(CheckpointNumber(1), 10);

      expect(result).toEqual([]);
    });
  });

  describe('getCheckpointsForEpoch', () => {
    it('returns checkpoints for a specific epoch based on slot numbers', async () => {
      // l1Constants has epochDuration: 4, so epoch 0 has slots 0-3, epoch 1 has slots 4-7
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => {
          // Checkpoint 1 & 2 in epoch 0 (slots 0-3), checkpoint 3 in epoch 1 (slots 4-7)
          const slotNumbers: Record<number, SlotNumber> = { 1: SlotNumber(1), 2: SlotNumber(3), 3: SlotNumber(5) };
          return { slotNumber: slotNumbers[Number(cpNumber)] };
        },
      });
      await archiverStore.addCheckpoints(testCheckpoints);

      const epoch0Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(0));
      expect(epoch0Checkpoints.length).toBe(2);
      expect(epoch0Checkpoints.map(c => c.number)).toEqual([1, 2]);

      const epoch1Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(1));
      expect(epoch1Checkpoints.length).toBe(1);
      expect(epoch1Checkpoints.map(c => c.number)).toEqual([3]);
    });

    it('returns empty array for epoch with no checkpoints', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: () => ({ slotNumber: SlotNumber(2) }), // Epoch 0
      });
      await archiverStore.addCheckpoints(testCheckpoints);

      const epoch1Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(1));
      expect(epoch1Checkpoints).toEqual([]);
    });

    it('returns checkpoints in correct order (ascending by checkpoint number)', async () => {
      // Create multiple checkpoints all in epoch 0
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => {
          // All in epoch 0 (slots 0-3)
          const slotNumbers: Record<number, SlotNumber> = { 1: SlotNumber(0), 2: SlotNumber(1), 3: SlotNumber(2) };
          return { slotNumber: slotNumbers[Number(cpNumber)] };
        },
      });
      await archiverStore.addCheckpoints(testCheckpoints);

      const epoch0Checkpoints = await archiver.getCheckpointsForEpoch(EpochNumber(0));
      expect(epoch0Checkpoints.length).toBe(3);
      expect(epoch0Checkpoints.map(c => c.number)).toEqual([1, 2, 3]);
    });
  });

  describe('addBlock (L2BlockSink)', () => {
    // State reference needs to be valid for LogStore's dataStartIndexForBlock calculation
    // All blocks use checkpoint number 1 since they're being added to the initial checkpoint
    const makeBlock = (
      blockNumber: BlockNumber,
      indexIntoCheckpoint = IndexWithinCheckpoint(0),
      previousArchive?: AppendOnlyTreeSnapshot,
    ) =>
      L2BlockNew.random(blockNumber, {
        checkpointNumber: CheckpointNumber(1),
        state: makeStateReference(0x100),
        indexWithinCheckpoint: indexIntoCheckpoint,
        ...(previousArchive ? { lastArchive: previousArchive } : {}),
      });

    // Genesis archive for the first block
    const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);

    it('adds a block to the store', async () => {
      const block = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      await archiver.addBlock(block);

      const retrievedBlock = await archiver.getL2BlockNew(BlockNumber(1));
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.number).toEqual(BlockNumber(1));
      expect((await retrievedBlock!.header.hash()).toString()).toEqual((await block.header.hash()).toString());
    });

    it('adds multiple blocks incrementally', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      const retrievedBlock1 = await archiver.getL2BlockNew(BlockNumber(1));
      const retrievedBlock2 = await archiver.getL2BlockNew(BlockNumber(2));
      const retrievedBlock3 = await archiver.getL2BlockNew(BlockNumber(3));

      expect(retrievedBlock1!.number).toEqual(BlockNumber(1));
      expect(retrievedBlock2!.number).toEqual(BlockNumber(2));
      expect(retrievedBlock3!.number).toEqual(BlockNumber(3));
    });

    it('rejects blocks with non-incremental block number (gap)', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block1.archive); // Skip block 2

      await archiver.addBlock(block1);

      // Block 3 should be rejected because block 2 is missing
      await expect(archiver.addBlock(block3)).rejects.toThrow(InitialBlockNumberNotSequentialError);
    });

    it('rejects blocks with duplicate block numbers', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Adding block 2 again shoud be rejected
      await expect(archiver.addBlock(block2)).rejects.toThrow(InitialBlockNumberNotSequentialError);
    });

    it('rejects first block if not starting from block 1', async () => {
      const block5 = await makeBlock(BlockNumber(5), IndexWithinCheckpoint(0), genesisArchive);

      // First block must be block 1
      await expect(archiver.addBlock(block5)).rejects.toThrow();
    });

    it('allows block number to start from 1 (initial block)', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);

      await archiver.addBlock(block1);

      const retrievedBlock = await archiver.getL2BlockNew(BlockNumber(1));
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.number).toEqual(BlockNumber(1));
    });

    it('retrieves multiple blocks with getL2BlocksNew', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 3);
      expect(blocks.length).toEqual(3);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
      expect(await blocks[2].hash()).toEqual(await block3.hash());
    });

    it('retrieves blocks with limit in getL2BlocksNew', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Request only 2 blocks starting from block 1
      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 2);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });

    it('retrieves blocks starting from middle with getL2BlocksNew', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Start from block 2
      const blocks = await archiver.getL2BlocksNew(BlockNumber(2), 2);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block2.hash());
      expect(await blocks[1].hash()).toEqual(await block3.hash());
    });

    it('returns empty array when requesting blocks beyond available range', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);

      await archiver.addBlock(block1);

      // Request blocks starting from block 5 (which doesn't exist)
      const blocks = await archiver.getL2BlocksNew(BlockNumber(5), 3);
      expect(blocks).toEqual([]);
    });

    it('returns partial results when limit exceeds available blocks', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Request 10 blocks but only 2 are available
      const blocks = await archiver.getL2BlocksNew(BlockNumber(1), 10);
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });
  });

  describe('getCheckpointedBlocks', () => {
    it('returns checkpointed blocks with checkpoint info', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointedBlocks(BlockNumber(1), 100);

      const expectedBlocks = testCheckpoints.flatMap(c => c.checkpoint.blocks);
      expect(result.length).toBe(expectedBlocks.length);

      // Verify blocks are returned with correct checkpoint info
      let blockIndex = 0;
      for (let cpIdx = 0; cpIdx < testCheckpoints.length; cpIdx++) {
        const checkpoint = testCheckpoints[cpIdx];
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          const cb = result[blockIndex];
          const expectedBlock = checkpoint.checkpoint.blocks[i];

          expect(cb.block.number).toBe(expectedBlock.number);
          expect(cb.checkpointNumber).toBe(checkpoint.checkpoint.number);
          expect(cb.block.archive.root.toString()).toBe(expectedBlock.archive.root.toString());
          expect(cb.l1).toBeDefined();
          expect(cb.l1.blockNumber).toBeGreaterThan(0n);

          blockIndex++;
        }
      }
    });

    it('respects the limit parameter', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointedBlocks(BlockNumber(1), 2);

      expect(result.length).toBe(2);
      expect(result[0].block.number).toBe(BlockNumber(1));
      expect(result[1].block.number).toBe(BlockNumber(2));
      expect(result[0].checkpointNumber).toBe(1);
      expect(result[1].checkpointNumber).toBe(2);
    });

    it('returns blocks starting from specified block number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointedBlocks(BlockNumber(2), 10);

      expect(result.length).toBe(2);
      expect(result[0].block.number).toBe(BlockNumber(2));
      expect(result[1].block.number).toBe(BlockNumber(3));
      expect(result[0].checkpointNumber).toBe(2);
      expect(result[1].checkpointNumber).toBe(3);
    });

    it('returns empty array when no checkpointed blocks exist', async () => {
      const result = await archiver.getCheckpointedBlocks(BlockNumber(1), 10);

      expect(result).toEqual([]);
    });

    it('filters by proven status when proven=true', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      // Set checkpoint 1 as proven
      await archiverStore.setProvenCheckpointNumber(CheckpointNumber(1));

      // Get all blocks
      const allBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 100);
      expect(allBlocks.length).toBe(3);

      // Get only proven blocks (checkpoint 1 only)
      const provenBlocks = await archiver.getCheckpointedBlocks(BlockNumber(1), 100, true);
      expect(provenBlocks.length).toBe(1);
      expect(provenBlocks[0].checkpointNumber).toBe(1);
      expect(provenBlocks[0].block.number).toBe(BlockNumber(1));
    });
  });

  describe('getL2BlocksNew with proven filter', () => {
    it('filters by proven status when proven=true', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      // Set checkpoint 1 as proven
      await archiverStore.setProvenCheckpointNumber(CheckpointNumber(1));

      // Get all blocks
      const allBlocks = await archiver.getL2BlocksNew(BlockNumber(1), 100);
      expect(allBlocks.length).toBe(3);

      // Get only proven blocks (checkpoint 1 only)
      const provenBlocks = await archiver.getL2BlocksNew(BlockNumber(1), 100, true);
      expect(provenBlocks.length).toBe(1);
      expect(provenBlocks[0].number).toBe(BlockNumber(1));

      // Verify unproven blocks are not included
      const unprovenBlockNumbers = [BlockNumber(2), BlockNumber(3)];
      provenBlocks.forEach(b => {
        expect(unprovenBlockNumbers).not.toContain(b.number);
      });
    });

    it('returns all blocks when proven=false or undefined', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(new Fr(GENESIS_ARCHIVE_ROOT), 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.addCheckpoints(testCheckpoints);

      // Set checkpoint 1 as proven
      await archiverStore.setProvenCheckpointNumber(CheckpointNumber(1));

      // Get blocks with proven=false - should include all blocks
      const blocksProvenFalse = await archiver.getL2BlocksNew(BlockNumber(1), 100, false);
      expect(blocksProvenFalse.length).toBe(3);
      expect(blocksProvenFalse.map(b => b.number)).toEqual([BlockNumber(1), BlockNumber(2), BlockNumber(3)]);

      // Get blocks with proven=undefined - should include all blocks
      const blocksProvenUndefined = await archiver.getL2BlocksNew(BlockNumber(1), 100);
      expect(blocksProvenUndefined.length).toBe(3);
      expect(blocksProvenUndefined.map(b => b.number)).toEqual([BlockNumber(1), BlockNumber(2), BlockNumber(3)]);
    });
  });
});
