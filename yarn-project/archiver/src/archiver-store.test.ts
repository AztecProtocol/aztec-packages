import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type OutboxContract, RollupContract } from '@aztec/ethereum/contracts';
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
import { DateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GENESIS_BLOCK_HEADER_HASH, L2Block } from '@aztec/stdlib/block';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeStateReference } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import { BlockNumberNotSequentialError } from './errors.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { type ArchiverDataStores, createArchiverDataStores, getArchiverSynchPoint } from './store/data_stores.js';
import { L2FrontierCache } from './store/l2_frontier_cache.js';
import { makeChainedCheckpoints } from './test/mock_structs.js';

describe('Archiver Store', () => {
  const rollupAddress = EthAddress.random();
  const registryAddress = EthAddress.random();
  const inboxAddress = EthAddress.random();
  const governanceProposerAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();

  let publicClient: MockProxy<ViemPublicClient>;
  let debugClient: MockProxy<ViemPublicClient>;
  let instrumentation: MockProxy<ArchiverInstrumentation>;
  let blobClient: MockProxy<BlobClientInterface>;
  let archiverStore: ArchiverDataStores;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };
  let initialHeader: BlockHeader;
  let genesisArchiveRoot: Fr;
  let archiver: Archiver;

  beforeEach(async () => {
    const now = +new Date();
    // Build a non-trivial initial header so we can distinguish it from BlockHeader.empty().
    initialHeader = BlockHeader.empty({ lastArchive: new AppendOnlyTreeSnapshot(Fr.fromString('0x1234'), 1) });
    // Genesis archive root is the post-block-0 archive root from L1, distinct from
    // initialHeader.lastArchive.root (which is the pre-block-0 archive, always empty in practice).
    genesisArchiveRoot = Fr.fromString('0xabcd');

    publicClient = mock<ViemPublicClient>();
    debugClient = publicClient;
    blobClient = mock<BlobClientInterface>();

    const rollupContract = mock<RollupContract>();
    Object.defineProperty(rollupContract, 'address', { value: rollupAddress.toString(), writable: true });

    const tracer = getTelemetryClient().getTracer('');
    instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });

    archiverStore = createArchiverDataStores(await openTmpStore('archiver_test'), GENESIS_BLOCK_HEADER_HASH);

    l1Constants = {
      l1GenesisTime: BigInt(now),
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
      genesisArchiveRoot,
    };

    const contractAddresses = {
      rollupAddress,
      registryAddress,
      inboxAddress,
      governanceProposerAddress,
      slashingProposerAddress,
    };

    const config = {
      pollingIntervalMs: 1000,
      batchSize: 1000,
      maxAllowedEthClientDriftSeconds: 300,
      ethereumAllowNoDebugHosts: true,
      checkpointProposalSyncGrace: 4,
      orphanPruneNoProposalTolerance: 1,
      skipOrphanProposedBlockPruning: false,
      blockDuration: 2,
    };

    const events = new EventEmitter() as ArchiverEmitter;
    const synchronizer = mock<ArchiverL1Synchronizer>();
    // syncFromL1 returns the blocks added during the L1 pass; the archiver spreads it, so the mock must resolve
    // to an array rather than the auto-mock's undefined.
    synchronizer.syncFromL1.mockResolvedValue([]);

    const initialBlockHash = await initialHeader.hash();
    const l2FrontierCache = new L2FrontierCache(archiverStore.blocks, initialBlockHash);
    archiver = new Archiver(
      publicClient,
      debugClient,
      rollupContract,
      mock<OutboxContract>(),
      contractAddresses,
      archiverStore,
      config,
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
      initialHeader,
      initialBlockHash,
      l2FrontierCache,
      new DateProvider(),
    );
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  describe('getCheckpoints', () => {
    it('returns published checkpoints with full checkpoint data', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 10 });

      expect(result.length).toBe(3);
      expect(result.map(c => c.checkpoint.number)).toEqual([1, 2, 3]);
      result.forEach((pc, i) => {
        expect(pc.checkpoint.blocks.length).toBeGreaterThan(0);
        expect(pc.checkpoint.archive.root.toString()).toEqual(testCheckpoints[i].checkpoint.archive.root.toString());
        expect(pc.l1).toBeDefined();
      });
    });

    it('respects the limit parameter', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 2 });

      expect(result.length).toBe(2);
      expect(result.map(c => c.checkpoint.number)).toEqual([1, 2]);
    });

    it('respects the starting checkpoint number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 10 });

      expect(result.length).toBe(2);
      expect(result.map(c => c.checkpoint.number)).toEqual([2, 3]);
    });

    it('returns empty array when no checkpoints exist', async () => {
      const result = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 10 });

      expect(result).toEqual([]);
    });
  });

  describe('getCheckpoints({ epoch })', () => {
    it('returns checkpoints for a specific epoch based on slot numbers', async () => {
      // l1Constants has epochDuration: 4, so epoch 0 has slots 0-3, epoch 1 has slots 4-7
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => {
          // Checkpoint 1 & 2 in epoch 0 (slots 0-3), checkpoint 3 in epoch 1 (slots 4-7)
          const slotNumbers: Record<number, SlotNumber> = { 1: SlotNumber(1), 2: SlotNumber(3), 3: SlotNumber(5) };
          return { slotNumber: slotNumbers[Number(cpNumber)] };
        },
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const epoch0Checkpoints = await archiver.getCheckpointsData({ epoch: EpochNumber(0) });
      expect(epoch0Checkpoints.length).toBe(2);
      expect(epoch0Checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2]);

      const epoch1Checkpoints = await archiver.getCheckpointsData({ epoch: EpochNumber(1) });
      expect(epoch1Checkpoints.length).toBe(1);
      expect(epoch1Checkpoints.map(c => c.checkpointNumber)).toEqual([3]);
    });

    it('returns empty array for epoch with no checkpoints', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: () => ({ slotNumber: SlotNumber(2) }), // Epoch 0
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const epoch1Checkpoints = await archiver.getCheckpointsData({ epoch: EpochNumber(1) });
      expect(epoch1Checkpoints).toEqual([]);
    });

    it('returns checkpoints in correct order (ascending by checkpoint number)', async () => {
      // Create multiple checkpoints all in epoch 0
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => {
          // All in epoch 0 (slots 0-3)
          const slotNumbers: Record<number, SlotNumber> = { 1: SlotNumber(0), 2: SlotNumber(1), 3: SlotNumber(2) };
          return { slotNumber: slotNumbers[Number(cpNumber)] };
        },
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const epoch0Checkpoints = await archiver.getCheckpointsData({ epoch: EpochNumber(0) });
      expect(epoch0Checkpoints.length).toBe(3);
      expect(epoch0Checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('getCheckpoint', () => {
    it('returns checkpoint by number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoint({ number: CheckpointNumber(2) });
      expect(result).toBeDefined();
      expect(result!.checkpoint.number).toBe(2);
    });

    it('returns undefined for unknown checkpoint number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(2, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoint({ number: CheckpointNumber(99) });
      expect(result).toBeUndefined();
    });

    it('returns checkpoint by slot', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const targetSlot = SlotNumber(7);
      const testCheckpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => ({
          slotNumber: cpNumber === CheckpointNumber(1) ? SlotNumber(3) : targetSlot,
        }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoint({ slot: targetSlot });
      expect(result).toBeDefined();
      expect(result!.checkpoint.number).toBe(2);
    });

    it('returns undefined for unknown slot', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: () => ({ slotNumber: SlotNumber(5) }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoint({ slot: SlotNumber(99) });
      expect(result).toBeUndefined();
    });

    it('returns the latest checkpointed checkpoint for tag=checkpointed', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoint({ tag: 'checkpointed' });
      expect(result).toBeDefined();
      expect(result!.checkpoint.number).toBe(3);
    });

    it('returns the proven checkpoint for tag=proven when one exists', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));

      const result = await archiver.getCheckpoint({ tag: 'proven' });
      expect(result).toBeDefined();
      expect(result!.checkpoint.number).toBe(2);
    });

    it('returns undefined for tag=proven when no checkpoints exist', async () => {
      // proven tip is checkpoint 0 (genesis), getCheckpoint returns undefined for number=0
      const result = await archiver.getCheckpoint({ tag: 'proven' });
      expect(result).toBeUndefined();
    });

    it('returns the finalized checkpoint for tag=finalized when one exists', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(3));
      await archiverStore.blocks.setFinalizedCheckpointNumber(CheckpointNumber(1));

      const result = await archiver.getCheckpoint({ tag: 'finalized' });
      expect(result).toBeDefined();
      expect(result!.checkpoint.number).toBe(1);
    });

    it('returns undefined for tag=finalized when no checkpoints exist', async () => {
      const result = await archiver.getCheckpoint({ tag: 'finalized' });
      expect(result).toBeUndefined();
    });
  });

  describe('getCheckpointData', () => {
    it('returns checkpoint data by number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointData({ number: CheckpointNumber(2) });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(2);
      expect(result!.l1).toBeDefined();
    });

    it('returns undefined for unknown checkpoint number', async () => {
      const result = await archiver.getCheckpointData({ number: CheckpointNumber(99) });
      expect(result).toBeUndefined();
    });

    it('returns checkpoint data by slot', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const targetSlot = SlotNumber(11);
      const testCheckpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => ({
          slotNumber: cpNumber === CheckpointNumber(1) ? SlotNumber(2) : targetSlot,
        }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointData({ slot: targetSlot });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(2);
    });

    it('returns undefined for unknown slot', async () => {
      const result = await archiver.getCheckpointData({ slot: SlotNumber(999) });
      expect(result).toBeUndefined();
    });

    it('returns the latest checkpointed data for tag=checkpointed', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointData({ tag: 'checkpointed' });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(3);
    });

    it('returns the proven checkpoint data for tag=proven', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));

      const result = await archiver.getCheckpointData({ tag: 'proven' });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(2);
    });

    it('returns the finalized checkpoint data for tag=finalized', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(3));
      await archiverStore.blocks.setFinalizedCheckpointNumber(CheckpointNumber(2));

      const result = await archiver.getCheckpointData({ tag: 'finalized' });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(2);
    });

    it('returns undefined for tags when chain is empty', async () => {
      expect(await archiver.getCheckpointData({ tag: 'proven' })).toBeUndefined();
      expect(await archiver.getCheckpointData({ tag: 'finalized' })).toBeUndefined();
    });
  });

  describe('getCheckpoints / getCheckpointsData', () => {
    it('getCheckpoints returns the right slice from from+limit', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(5, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpoints({ from: CheckpointNumber(2), limit: 3 });
      expect(result.length).toBe(3);
      expect(result.map(c => c.checkpoint.number)).toEqual([2, 3, 4]);
    });

    it('getCheckpointsData returns the right slice from from+limit', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(5, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointsData({ from: CheckpointNumber(3), limit: 2 });
      expect(result.length).toBe(2);
      expect(result.map(c => c.checkpointNumber)).toEqual([3, 4]);
    });

    it('getCheckpoints returns [] for empty range', async () => {
      const result = await archiver.getCheckpoints({ from: CheckpointNumber(1), limit: 10 });
      expect(result).toEqual([]);
    });

    it('getCheckpointsData returns [] for unknown epoch', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // checkpoint 1 in epoch 0 (slot 1, epochDuration=4)
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: () => ({ slotNumber: SlotNumber(1) }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getCheckpointsData({ epoch: EpochNumber(5) });
      expect(result).toEqual([]);
    });
  });

  describe('getProposedCheckpointData', () => {
    async function addProposedCheckpoint(
      checkpointNumber: CheckpointNumber,
      slotNumber: SlotNumber,
      startBlock: BlockNumber,
    ) {
      const block = await L2Block.random(startBlock, {
        checkpointNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(0),
      });
      await archiverStore.blocks.addProposedBlock(block, { force: true });
      await archiverStore.blocks.addProposedCheckpoint({
        checkpointNumber,
        header: CheckpointHeader.random({ slotNumber }),
        startBlock,
        blockCount: 1,
        totalManaUsed: 100n,
        feeAssetPriceModifier: 0n,
      });
    }

    it('returns the latest proposed entry when called with no args', async () => {
      await addProposedCheckpoint(CheckpointNumber(1), SlotNumber(3), BlockNumber(1));

      const result = await archiver.getProposedCheckpointData();
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(1);
    });

    it('returns undefined when no proposed entry exists (no args)', async () => {
      const result = await archiver.getProposedCheckpointData();
      expect(result).toBeUndefined();
    });

    it('returns the latest proposed entry for tag=proposed', async () => {
      await addProposedCheckpoint(CheckpointNumber(1), SlotNumber(5), BlockNumber(1));

      const result = await archiver.getProposedCheckpointData({ tag: 'proposed' });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(1);
    });

    it('returns matching proposed entry by number', async () => {
      await addProposedCheckpoint(CheckpointNumber(1), SlotNumber(2), BlockNumber(1));

      const result = await archiver.getProposedCheckpointData({ number: CheckpointNumber(1) });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(1);
    });

    it('returns undefined for number that has no proposed entry', async () => {
      await addProposedCheckpoint(CheckpointNumber(1), SlotNumber(2), BlockNumber(1));

      const result = await archiver.getProposedCheckpointData({ number: CheckpointNumber(99) });
      expect(result).toBeUndefined();
    });

    it('returns matching proposed entry by slot', async () => {
      const targetSlot = SlotNumber(7);
      await addProposedCheckpoint(CheckpointNumber(1), targetSlot, BlockNumber(1));

      const result = await archiver.getProposedCheckpointData({ slot: targetSlot });
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(1);
      expect(result!.header.slotNumber).toBe(targetSlot);
    });

    it('returns undefined for slot that has no proposed entry', async () => {
      await addProposedCheckpoint(CheckpointNumber(1), SlotNumber(3), BlockNumber(1));

      const result = await archiver.getProposedCheckpointData({ slot: SlotNumber(999) });
      expect(result).toBeUndefined();
    });

    it('never falls back to confirmed checkpoints', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const confirmedCheckpoints = await makeChainedCheckpoints(2, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(confirmedCheckpoints);

      // No proposed checkpoint exists — all queries should return undefined
      expect(await archiver.getProposedCheckpointData()).toBeUndefined();
      expect(await archiver.getProposedCheckpointData({ tag: 'proposed' })).toBeUndefined();
      expect(await archiver.getProposedCheckpointData({ number: CheckpointNumber(1) })).toBeUndefined();
      expect(await archiver.getProposedCheckpointData({ number: CheckpointNumber(2) })).toBeUndefined();
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
      L2Block.random(blockNumber, {
        checkpointNumber: CheckpointNumber(1),
        state: makeStateReference(0x100),
        indexWithinCheckpoint: indexIntoCheckpoint,
        ...(previousArchive ? { lastArchive: previousArchive } : {}),
      });

    // Genesis archive for the first block — bound in beforeEach so it picks up the suite-level genesisArchiveRoot.
    let genesisArchive: AppendOnlyTreeSnapshot;
    beforeEach(() => {
      genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
    });

    it('adds a block to the store', async () => {
      const block = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      await archiver.addBlock(block);

      const retrievedBlock = await archiver.getBlock({ number: BlockNumber(1) });
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

      const retrievedBlock1 = await archiver.getBlock({ number: BlockNumber(1) });
      const retrievedBlock2 = await archiver.getBlock({ number: BlockNumber(2) });
      const retrievedBlock3 = await archiver.getBlock({ number: BlockNumber(3) });

      expect(retrievedBlock1!.number).toEqual(BlockNumber(1));
      expect(retrievedBlock2!.number).toEqual(BlockNumber(2));
      expect(retrievedBlock3!.number).toEqual(BlockNumber(3));
    });

    it('rejects blocks with non-incremental block number (gap)', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block1.archive); // Skip block 2

      await archiver.addBlock(block1);

      // Block 3 should be rejected because block 2 is missing
      await expect(archiver.addBlock(block3)).rejects.toThrow(BlockNumberNotSequentialError);
    });

    it('rejects blocks with duplicate block numbers', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Adding block 2 again shoud be rejected
      await expect(archiver.addBlock(block2)).rejects.toThrow(BlockNumberNotSequentialError);
    });

    it('rejects first block if not starting from block 1', async () => {
      const block5 = await makeBlock(BlockNumber(5), IndexWithinCheckpoint(0), genesisArchive);

      // First block must be block 1
      await expect(archiver.addBlock(block5)).rejects.toThrow();
    });

    it('allows block number to start from 1 (initial block)', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);

      await archiver.addBlock(block1);

      const retrievedBlock = await archiver.getBlock({ number: BlockNumber(1) });
      expect(retrievedBlock).toBeDefined();
      expect(retrievedBlock!.number).toEqual(BlockNumber(1));
    });

    it('retrieves multiple blocks with getBlocks', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      const blocks = await archiver.getBlocks({ from: BlockNumber(1), limit: 3 });
      expect(blocks.length).toEqual(3);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
      expect(await blocks[2].hash()).toEqual(await block3.hash());
    });

    it('retrieves blocks with limit in getBlocks', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Request only 2 blocks starting from block 1
      const blocks = await archiver.getBlocks({ from: BlockNumber(1), limit: 2 });
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });

    it('retrieves blocks starting from middle with getBlocks', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);
      const block3 = await makeBlock(BlockNumber(3), IndexWithinCheckpoint(2), block2.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);
      await archiver.addBlock(block3);

      // Start from block 2
      const blocks = await archiver.getBlocks({ from: BlockNumber(2), limit: 2 });
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block2.hash());
      expect(await blocks[1].hash()).toEqual(await block3.hash());
    });

    it('returns empty array when requesting blocks beyond available range', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);

      await archiver.addBlock(block1);

      // Request blocks starting from block 5 (which doesn't exist)
      const blocks = await archiver.getBlocks({ from: BlockNumber(5), limit: 3 });
      expect(blocks).toEqual([]);
    });

    it('returns partial results when limit exceeds available blocks', async () => {
      const block1 = await makeBlock(BlockNumber(1), IndexWithinCheckpoint(0), genesisArchive);
      const block2 = await makeBlock(BlockNumber(2), IndexWithinCheckpoint(1), block1.archive);

      await archiver.addBlock(block1);
      await archiver.addBlock(block2);

      // Request 10 blocks but only 2 are available
      const blocks = await archiver.getBlocks({ from: BlockNumber(1), limit: 10 });
      expect(blocks.length).toEqual(2);
      expect(await blocks[0].hash()).toEqual(await block1.hash());
      expect(await blocks[1].hash()).toEqual(await block2.hash());
    });
  });

  describe('getBlocks with onlyCheckpointed', () => {
    it('returns checkpointed blocks with checkpoint info', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getBlocks({ from: BlockNumber(1), limit: 100, onlyCheckpointed: true });

      const expectedBlocks = testCheckpoints.flatMap(c => c.checkpoint.blocks);
      expect(result.length).toBe(expectedBlocks.length);

      // Verify blocks are returned with correct checkpoint info
      let blockIndex = 0;
      for (let cpIdx = 0; cpIdx < testCheckpoints.length; cpIdx++) {
        const checkpoint = testCheckpoints[cpIdx];
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          const cb = result[blockIndex];
          const expectedBlock = checkpoint.checkpoint.blocks[i];

          expect(cb.number).toBe(expectedBlock.number);
          expect(cb.checkpointNumber).toBe(checkpoint.checkpoint.number);
          expect(cb.archive.root.toString()).toBe(expectedBlock.archive.root.toString());
          const checkpointData = await archiverStore.blocks.getCheckpointData(cb.checkpointNumber);
          expect(checkpointData?.l1).toBeDefined();
          expect(checkpointData!.l1.blockNumber).toBeGreaterThan(0n);

          blockIndex++;
        }
      }
    });

    it('respects the limit parameter', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getBlocks({ from: BlockNumber(1), limit: 2, onlyCheckpointed: true });

      expect(result.length).toBe(2);
      expect(result[0].number).toBe(BlockNumber(1));
      expect(result[1].number).toBe(BlockNumber(2));
      expect(result[0].checkpointNumber).toBe(1);
      expect(result[1].checkpointNumber).toBe(2);
    });

    it('returns blocks starting from specified block number', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, { previousArchive: genesisArchive });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const result = await archiver.getBlocks({ from: BlockNumber(2), limit: 10, onlyCheckpointed: true });

      expect(result.length).toBe(2);
      expect(result[0].number).toBe(BlockNumber(2));
      expect(result[1].number).toBe(BlockNumber(3));
      expect(result[0].checkpointNumber).toBe(2);
      expect(result[1].checkpointNumber).toBe(3);
    });

    it('returns empty array when no checkpointed blocks exist', async () => {
      const result = await archiver.getBlocks({ from: BlockNumber(1), limit: 10, onlyCheckpointed: true });

      expect(result).toEqual([]);
    });
  });

  describe('getBlocks / getBlocksData with epoch query', () => {
    it('returns empty array for epoch with no checkpoints', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1 is in epoch 0 (slot 1, epochDuration=4)
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: () => ({ slotNumber: SlotNumber(1) }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Epoch 1 has no checkpoints — both methods must return [] without throwing
      await expect(archiver.getBlocks({ epoch: EpochNumber(1), onlyCheckpointed: true })).resolves.toEqual([]);
      await expect(archiver.getBlocksData({ epoch: EpochNumber(1), onlyCheckpointed: true })).resolves.toEqual([]);
    });

    it('returns blocks for epoch with checkpoints', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        makeCheckpointOptions: cpNumber => ({
          slotNumber: SlotNumber(Number(cpNumber) - 1), // Slots 0 and 1, both in epoch 0
        }),
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const blocks = await archiver.getBlocks({ epoch: EpochNumber(0), onlyCheckpointed: true });
      expect(blocks.length).toBe(2);
      expect(blocks[0].number).toBe(BlockNumber(1));
      expect(blocks[1].number).toBe(BlockNumber(2));

      const blocksData = await archiver.getBlocksData({ epoch: EpochNumber(0), onlyCheckpointed: true });
      expect(blocksData.length).toBe(2);
    });
  });

  describe('getBlock / getBlockData with tag', () => {
    it('returns the genesis block for any tag when chain is empty', async () => {
      for (const tag of ['proposed', 'checkpointed', 'proven', 'finalized'] as const) {
        const block = await archiver.getBlock({ tag });
        expect(block?.number).toBe(BlockNumber.ZERO);
        const data = await archiver.getBlockData({ tag });
        expect(data?.header.globalVariables.blockNumber).toBe(BlockNumber.ZERO);
      }
    });

    it('resolves proposed to the latest block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      const block = await archiver.getBlock({ tag: 'proposed' });
      expect(block?.number).toBe(BlockNumber(6));
      const data = await archiver.getBlockData({ tag: 'proposed' });
      expect(data?.header.globalVariables.blockNumber).toBe(BlockNumber(6));
    });

    it('resolves checkpointed, proven, and finalized to the corresponding block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Checkpoint 1 = blocks 1-2, checkpoint 2 = blocks 3-4, checkpoint 3 = blocks 5-6.
      // All checkpoints are added so checkpointed L2 block = 6.
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));
      await archiverStore.blocks.setFinalizedCheckpointNumber(CheckpointNumber(1));

      const checkpointedBlock = await archiver.getBlock({ tag: 'checkpointed' });
      expect(checkpointedBlock?.number).toBe(BlockNumber(6));

      const provenBlock = await archiver.getBlock({ tag: 'proven' });
      expect(provenBlock?.number).toBe(BlockNumber(4));

      const finalizedBlock = await archiver.getBlock({ tag: 'finalized' });
      expect(finalizedBlock?.number).toBe(BlockNumber(2));

      const provenData = await archiver.getBlockData({ tag: 'proven' });
      expect(provenData?.header.globalVariables.blockNumber).toBe(BlockNumber(4));
    });

    it('returns the genesis block when proven tag points to genesis', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const testCheckpoints = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 1,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // No proven checkpoint set — proven block number is 0 → genesis.
      const block = await archiver.getBlock({ tag: 'proven' });
      expect(block?.number).toBe(BlockNumber.ZERO);
      const data = await archiver.getBlockData({ tag: 'proven' });
      expect(data?.header.globalVariables.blockNumber).toBe(BlockNumber.ZERO);
    });
  });

  describe('rollbackTo', () => {
    beforeEach(() => {
      publicClient.getBlock.mockImplementation(
        (args: { blockNumber?: bigint } = {}) =>
          Promise.resolve({ number: args.blockNumber ?? 0n, hash: `0x${'0'.repeat(64)}` }) as any,
      );
    });

    it('rejects rollback to a block that is not at a checkpoint boundary', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: 3 blocks (1, 2, 3). Checkpoint 2: 3 blocks (4, 5, 6).
      const testCheckpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 3,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Block 1 is not at a checkpoint boundary (checkpoint 1 ends at block 3)
      await expect(archiver.rollbackTo(BlockNumber(1))).rejects.toThrow(
        /not at a checkpoint boundary.*Use block 3 to roll back to this checkpoint.*or block 0 to roll back to the previous one/,
      );

      // Block 2 is also not at a checkpoint boundary
      await expect(archiver.rollbackTo(BlockNumber(2))).rejects.toThrow(
        /not at a checkpoint boundary.*Use block 3 to roll back to this checkpoint.*or block 0 to roll back to the previous one/,
      );
    });

    it('rejects rollback to a proposed but not yet checkpointed block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      const checkpoints1 = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      const checkpoints2 = await makeChainedCheckpoints(1, {
        previousArchive: checkpoints1[0].checkpoint.blocks.at(-1)!.archive,
        startCheckpointNumber: CheckpointNumber(2),
        startBlockNumber: 3,
        startL1BlockNumber: 20,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(checkpoints1);
      for (const block of checkpoints2[0].checkpoint.blocks) {
        await archiverStore.blocks.addProposedBlock(block);
      }

      await expect(archiver.rollbackTo(BlockNumber(3))).rejects.toThrow(/Target L2 block 3 is not checkpointed yet/);
    });

    it('allows rollback to the last block of a checkpoint and updates sync points', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: 3 blocks (1, 2, 3), L1 block 10. Checkpoint 2: 3 blocks (4, 5, 6), L1 block 20.
      const testCheckpoints = await makeChainedCheckpoints(2, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 3,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Block 3 is the last block of checkpoint 1 — should succeed
      await archiver.rollbackTo(BlockNumber(3));

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Verify sync points are set to checkpoint 1's L1 block number (10)
      const synchPoint = await getArchiverSynchPoint(archiverStore);
      expect(synchPoint.blocksSynchedTo).toEqual(10n);
      expect(synchPoint.messagesSynchedTo?.l1BlockNumber).toEqual(10n);
    });

    it('includes correct boundary info in error for mid-checkpoint rollback', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: 2 blocks (1, 2). Checkpoint 2: 3 blocks (3, 4, 5).
      const checkpoints1 = await makeChainedCheckpoints(1, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      const checkpoints2 = await makeChainedCheckpoints(1, {
        previousArchive: checkpoints1[0].checkpoint.blocks.at(-1)!.archive,
        startCheckpointNumber: CheckpointNumber(2),
        startBlockNumber: 3,
        startL1BlockNumber: 20,
        blocksPerCheckpoint: 3,
      });
      await archiverStore.blocks.addCheckpoints([...checkpoints1, ...checkpoints2]);

      // Block 3 is the first of checkpoint 2 (spans 3-5)
      // Should suggest block 5 (end of this checkpoint) or block 2 (end of previous)
      await expect(archiver.rollbackTo(BlockNumber(3))).rejects.toThrow(
        /Checkpoint 2 spans blocks 3 to 5.*Use block 5 to roll back to this checkpoint.*or block 2 to roll back to the previous one/,
      );
    });

    it('rolls back proven checkpoint number when target is before proven block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: blocks 1-2, Checkpoint 2: blocks 3-4, Checkpoint 3: blocks 5-6
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Mark checkpoint 2 as proven
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(2));

      // Roll back to block 2 (end of checkpoint 1), which is before proven block 4
      await archiver.rollbackTo(BlockNumber(2));

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));
    });

    it('preserves proven checkpoint number when target is after proven block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: blocks 1-2, Checkpoint 2: blocks 3-4, Checkpoint 3: blocks 5-6
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Mark checkpoint 1 as proven
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(1));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));

      // Roll back to block 4 (end of checkpoint 2), which is after proven block 2
      await archiver.rollbackTo(BlockNumber(4));

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));
      expect(await archiver.getProvenCheckpointNumber()).toEqual(CheckpointNumber(1));
    });

    it('rolls back finalized checkpoint number when target is before finalized block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: blocks 1-2, Checkpoint 2: blocks 3-4, Checkpoint 3: blocks 5-6
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Mark checkpoints 1 and 2 as proven and finalized
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));
      await archiverStore.blocks.setFinalizedCheckpointNumber(CheckpointNumber(2));
      expect(await archiver.getBlockNumber({ tag: 'finalized' })).toEqual(BlockNumber(4));

      // Roll back to block 2 (end of checkpoint 1), which is before finalized block 4
      await archiver.rollbackTo(BlockNumber(2));

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(1));
      expect(await archiver.getBlockNumber({ tag: 'finalized' })).toEqual(BlockNumber(2));
    });

    it('preserves finalized checkpoint number when target is after finalized block', async () => {
      const genesisArchive = new AppendOnlyTreeSnapshot(genesisArchiveRoot, 1);
      // Checkpoint 1: blocks 1-2, Checkpoint 2: blocks 3-4, Checkpoint 3: blocks 5-6
      const testCheckpoints = await makeChainedCheckpoints(3, {
        previousArchive: genesisArchive,
        blocksPerCheckpoint: 2,
      });
      await archiverStore.blocks.addCheckpoints(testCheckpoints);

      // Mark checkpoint 1 as finalized, checkpoint 2 as proven
      await archiverStore.blocks.setProvenCheckpointNumber(CheckpointNumber(2));
      await archiverStore.blocks.setFinalizedCheckpointNumber(CheckpointNumber(1));
      expect(await archiver.getBlockNumber({ tag: 'finalized' })).toEqual(BlockNumber(2));

      // Roll back to block 4 (end of checkpoint 2), which is after finalized block 2
      await archiver.rollbackTo(BlockNumber(4));

      expect(await archiver.getCheckpointNumber()).toEqual(CheckpointNumber(2));
      expect(await archiver.getBlockNumber({ tag: 'finalized' })).toEqual(BlockNumber(2));
    });
  });

  describe('genesis block handling', () => {
    it('getBlock({number:0}) returns the synthetic genesis block', async () => {
      const block = await archiver.getBlock({ number: BlockNumber.ZERO });
      expect(block).toBeDefined();
      expect(block!.header).toEqual(initialHeader);
    });

    it('getBlock({hash:initialHeaderHash}) returns the synthetic genesis block', async () => {
      const initialHeaderHash = await initialHeader.hash();
      const block = await archiver.getBlock({ hash: initialHeaderHash });
      expect(block).toBeDefined();
      expect(block!.header).toEqual(initialHeader);
    });

    it('getBlock({archive:genesisArchiveRoot}) returns the synthetic genesis block', async () => {
      const block = await archiver.getBlock({ archive: genesisArchiveRoot });
      expect(block).toBeDefined();
      expect(block!.header).toEqual(initialHeader);
      expect(block!.archive.root).toEqual(genesisArchiveRoot);
      expect(block!.archive.nextAvailableLeafIndex).toEqual(1);
    });

    it('getBlock({archive:initialHeader.lastArchive.root}) does NOT match genesis (it is the pre-block-0 archive)', async () => {
      const block = await archiver.getBlock({ archive: initialHeader.lastArchive.root });
      expect(block).toBeUndefined();
    });

    it('getBlock({tag:"finalized"}) returns the synthetic genesis block when no blocks synced', async () => {
      // With an empty store the finalized tip is INITIAL_L2_BLOCK_NUM - 1 = 0 → resolves to genesis.
      const block = await archiver.getBlock({ tag: 'finalized' });
      expect(block).toBeDefined();
      expect(block!.header).toEqual(initialHeader);
    });

    it('getBlockData({number:0}) returns the synthetic genesis block data', async () => {
      const data = await archiver.getBlockData({ number: BlockNumber.ZERO });
      expect(data).toBeDefined();
      expect(data!.header).toEqual(initialHeader);
      expect(data!.blockHash).toEqual(await initialHeader.hash());
    });

    it('getBlockNumber({hash:initialHeaderHash}) returns 0', async () => {
      const initialHeaderHash = await initialHeader.hash();
      const number = await archiver.getBlockNumber({ hash: initialHeaderHash });
      expect(number).toEqual(BlockNumber.ZERO);
    });

    it('getBlocks({from:0, limit:5}) throws — range queries do not support genesis', async () => {
      await expect(archiver.getBlocks({ from: BlockNumber.ZERO, limit: 5 })).rejects.toThrow(/from/);
    });

    it('returns the same block instance on consecutive calls (caching invariant)', async () => {
      const block1 = await archiver.getBlock({ number: BlockNumber.ZERO });
      const block2 = await archiver.getBlock({ number: BlockNumber.ZERO });
      expect(block1).toBe(block2);
    });
  });
});
