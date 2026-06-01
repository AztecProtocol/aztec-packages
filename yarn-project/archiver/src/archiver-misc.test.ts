import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { GENESIS_BLOCK_HEADER_HASH, type L2Tips } from '@aztec/stdlib/block';
import type { CheckpointData } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { createArchiverDataStores } from './store/data_stores.js';
import { L2TipsCache } from './store/l2_tips_cache.js';

describe('Archiver misc', () => {
  let archiver: Archiver;
  let synchronizer: MockProxy<ArchiverL1Synchronizer>;
  let l1Constants: L1RollupConstants & { l1StartBlockHash: Buffer32; genesisArchiveRoot: Fr };

  const L1_GENESIS_TIME = 1000n;
  const SLOT_DURATION = 24;
  const ETH_SLOT_DURATION = DefaultL1ContractsConfig.ethereumSlotDuration;
  const EPOCH_DURATION = 4;

  beforeEach(async () => {
    l1Constants = {
      l1GenesisTime: L1_GENESIS_TIME,
      l1StartBlock: 0n,
      l1StartBlockHash: Buffer32.random(),
      epochDuration: EPOCH_DURATION,
      slotDuration: SLOT_DURATION,
      ethereumSlotDuration: ETH_SLOT_DURATION,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };

    synchronizer = mock<ArchiverL1Synchronizer>();

    const publicClient = mock<ViemPublicClient>();
    const blobClient = mock<BlobClientInterface>();
    const rollupContract = mock<RollupContract>();

    const tracer = getTelemetryClient().getTracer('');
    const instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });
    const archiverStore = createArchiverDataStores(await openTmpStore('archiver_misc_test'), GENESIS_BLOCK_HEADER_HASH);
    const events = new EventEmitter() as ArchiverEmitter;
    const initialHeader = BlockHeader.empty();
    const initialBlockHash = await initialHeader.hash();
    const l2TipsCache = new L2TipsCache(archiverStore.blocks, initialBlockHash);

    archiver = new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      {
        rollupAddress: EthAddress.random(),
        registryAddress: EthAddress.random(),
        inboxAddress: EthAddress.random(),
        governanceProposerAddress: EthAddress.random(),
        slashingProposerAddress: EthAddress.random(),
      },
      archiverStore,
      {
        pollingIntervalMs: 1000,
        batchSize: 1000,
        maxAllowedEthClientDriftSeconds: 300,
        orphanProposedBlockPruneGraceSeconds: 2,
        enableOrphanProposedBlockPruning: true,
      },
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
      initialHeader,
      initialBlockHash,
      l2TipsCache,
      new DateProvider(),
    );
  });

  afterEach(async () => {
    await archiver?.stop();
  });

  /** Returns the L1 timestamp at the start of an L2 slot. */
  function slotStart(slot: number): bigint {
    return L1_GENESIS_TIME + BigInt(slot) * BigInt(SLOT_DURATION);
  }

  /** Returns the L1 timestamp at the last L1 block of an L2 slot. */
  function slotLastL1Block(slot: number): bigint {
    // The last L1 block in an L2 slot is the one where the next L1 block falls in the next L2 slot.
    // Start of next slot minus ethereumSlotDuration gives us the last L1 block still in this slot.
    return slotStart(slot + 1) - BigInt(ETH_SLOT_DURATION);
  }

  describe('getSyncedL2SlotNumber', () => {
    it('returns undefined before any sync', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(undefined);
      expect(await archiver.getSyncedL2SlotNumber()).toBeUndefined();
    });

    it('returns undefined when L1 timestamp is before genesis', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(L1_GENESIS_TIME - 100n);
      expect(await archiver.getSyncedL2SlotNumber()).toBeUndefined();
    });

    it('returns undefined at very start of slot 0 (next L1 block still in slot 0)', async () => {
      // At genesis, next L1 block at genesis+12 is still in slot 0 (slot 0 covers [0, 24)).
      synchronizer.getL1Timestamp.mockReturnValue(L1_GENESIS_TIME);
      expect(await archiver.getSyncedL2SlotNumber()).toBeUndefined();
    });

    it('returns slot 0 when last L1 block of slot 0 has been synced', async () => {
      // Last L1 block in slot 0: next L1 block (at ts+12) lands in slot 1.
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(0));
      expect(await archiver.getSyncedL2SlotNumber()).toEqual(SlotNumber(0));
    });

    it('returns slot 0 at the start of slot 1', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(slotStart(1));
      expect(await archiver.getSyncedL2SlotNumber()).toEqual(SlotNumber(0));
    });

    it('returns slot 4 when last L1 block of slot 4 has been synced', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(4));
      expect(await archiver.getSyncedL2SlotNumber()).toEqual(SlotNumber(4));
    });

    it('returns slot N-1 when L1 timestamp is mid-slot N', async () => {
      // Mid slot 3: next L1 block (ts+12) still in slot 3, so slot 2 is last fully synced.
      const midSlot3 = slotStart(3) + BigInt(ETH_SLOT_DURATION);
      synchronizer.getL1Timestamp.mockReturnValue(midSlot3);
      // next L1 block = midSlot3 + 12 = genesis + 3*24 + 24 = genesis + 96
      // slot at genesis+96 = 96/24 = 4, so synced = 4-1 = 3
      // Actually midSlot3 = genesis + 3*24 + 12 = genesis + 84
      // next = genesis + 84 + 12 = genesis + 96, slot = 96/24 = 4, synced = 3
      expect(await archiver.getSyncedL2SlotNumber()).toEqual(SlotNumber(3));
    });
  });

  describe('getSyncedL2EpochNumber', () => {
    // With epochDuration=4: epoch 0 = slots 0-3, epoch 1 = slots 4-7, epoch 2 = slots 8-11

    it('returns undefined before any sync', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(undefined);
      expect(await archiver.getSyncedL2EpochNumber()).toBeUndefined();
    });

    it('returns undefined when only part of epoch 0 is synced', async () => {
      // Synced slot 0 => epoch 0 not fully synced, no previous epoch.
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(0));
      expect(await archiver.getSyncedL2EpochNumber()).toBeUndefined();
    });

    it('returns undefined when synced to slot 2 (mid epoch 0)', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(2));
      expect(await archiver.getSyncedL2EpochNumber()).toBeUndefined();
    });

    it('returns epoch 0 when synced through last slot of epoch 0', async () => {
      // Epoch 0 last slot = 3
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(3));
      expect(await archiver.getSyncedL2EpochNumber()).toEqual(EpochNumber(0));
    });

    it('returns epoch 0 when synced to first slot of epoch 1', async () => {
      // Synced slot 4 = first slot of epoch 1, so only epoch 0 is fully synced.
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(4));
      expect(await archiver.getSyncedL2EpochNumber()).toEqual(EpochNumber(0));
    });

    it('returns epoch 0 when synced to slot 6 (mid epoch 1)', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(6));
      expect(await archiver.getSyncedL2EpochNumber()).toEqual(EpochNumber(0));
    });

    it('returns epoch 1 when synced through last slot of epoch 1', async () => {
      // Epoch 1 last slot = 7
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(7));
      expect(await archiver.getSyncedL2EpochNumber()).toEqual(EpochNumber(1));
    });

    it('returns epoch 1 when synced to mid epoch 2', async () => {
      synchronizer.getL1Timestamp.mockReturnValue(slotLastL1Block(9));
      expect(await archiver.getSyncedL2EpochNumber()).toEqual(EpochNumber(1));
    });
  });

  describe('isPruneDueAtSlot', () => {
    /**
     * Builds a fake L2Tips. `pending` is the L1-confirmed pending checkpoint (= `tips.checkpointed`
     * in production). `proposedCheckpoint` is set to `pending + 1` to catch any implementation that
     * accidentally reads the local-optimistic proposed checkpoint instead of the L1-confirmed one.
     */
    function makeTips(pending: CheckpointNumber, proven: CheckpointNumber): L2Tips {
      const block = { number: BlockNumber(0), hash: '0x' };
      const tip = (n: CheckpointNumber) => ({ block, checkpoint: { number: n, hash: '0x' } });
      const proposedAhead = CheckpointNumber(Number(pending) + 1);
      return {
        proposed: block,
        proposedCheckpoint: tip(proposedAhead),
        checkpointed: tip(pending),
        proven: tip(proven),
        finalized: tip(proven),
      };
    }

    /** Builds a fake CheckpointData with only the fields these methods read. */
    function makeCheckpointData(checkpointNumber: CheckpointNumber, slotNumber: SlotNumber): CheckpointData {
      return {
        checkpointNumber,
        header: CheckpointHeader.empty({ slotNumber }),
      } as unknown as CheckpointData;
    }

    /**
     * Stubs `getL2Tips` and `getCheckpointData` so that the methods under test see a
     * synthetic chain. Each entry in `checkpoints` maps a checkpoint number to its slot.
     */
    function stubChain(args: {
      pending: CheckpointNumber;
      proven: CheckpointNumber;
      checkpoints: Array<{ number: CheckpointNumber; slot: SlotNumber }>;
    }): void {
      jest.spyOn(archiver, 'getL2Tips').mockResolvedValue(makeTips(args.pending, args.proven));
      jest
        .spyOn(archiver, 'getCheckpointData')
        .mockImplementation((query: any): Promise<CheckpointData | undefined> => {
          if ('number' in query) {
            const entry = args.checkpoints.find(c => c.number === query.number);
            return Promise.resolve(entry ? makeCheckpointData(entry.number, entry.slot) : undefined);
          }
          return Promise.resolve(undefined);
        });
    }

    // proofSubmissionEpochs = 1 (from beforeEach). With epochDuration = 4:
    // epoch 0 = slots 0-3, epoch 1 = slots 4-7, epoch 2 = slots 8-11, epoch 3 = slots 12-15.
    // Deadline epoch for an epoch K is K + proofSubmissionEpochs + 1 = K + 2.
    // So a checkpoint in epoch K becomes "prune-due" when the current slot's epoch >= K + 2.

    it('returns false when pending equals proven', async () => {
      stubChain({ pending: CheckpointNumber(3), proven: CheckpointNumber(3), checkpoints: [] });
      expect(await archiver.isPruneDueAtSlot(SlotNumber(20))).toBe(false);
    });

    it('returns false when slot is before the deadline', async () => {
      // Oldest unproven checkpoint is in epoch 0 (slot 2). Deadline epoch = 2.
      // Slot 7 is in epoch 1, which is before the deadline.
      stubChain({
        pending: CheckpointNumber(2),
        proven: CheckpointNumber(0),
        checkpoints: [
          { number: CheckpointNumber(1), slot: SlotNumber(2) },
          { number: CheckpointNumber(2), slot: SlotNumber(3) },
        ],
      });
      expect(await archiver.isPruneDueAtSlot(SlotNumber(7))).toBe(false);
    });

    it('returns true when slot is at or after the deadline', async () => {
      // Oldest unproven checkpoint is in epoch 0. Deadline epoch = 2.
      // Slot 8 is the first slot of epoch 2, so the deadline has expired.
      stubChain({
        pending: CheckpointNumber(2),
        proven: CheckpointNumber(0),
        checkpoints: [
          { number: CheckpointNumber(1), slot: SlotNumber(2) },
          { number: CheckpointNumber(2), slot: SlotNumber(3) },
        ],
      });
      expect(await archiver.isPruneDueAtSlot(SlotNumber(8))).toBe(true);
    });
  });
});
