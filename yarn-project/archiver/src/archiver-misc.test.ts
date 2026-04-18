import type { BlobClientInterface } from '@aztec/blob-client/client';
import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import type { EpochCache, EpochCommitteeInfo } from '@aztec/epoch-cache';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Archiver, type ArchiverEmitter } from './archiver.js';
import type { ArchiverInstrumentation } from './modules/instrumentation.js';
import { ArchiverL1Synchronizer } from './modules/l1_synchronizer.js';
import { KVArchiverDataStore } from './store/kv_archiver_store.js';
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
    const epochCache = mock<EpochCache>();
    epochCache.getCommitteeForEpoch.mockResolvedValue({ committee: [] as EthAddress[] } as EpochCommitteeInfo);

    const tracer = getTelemetryClient().getTracer('');
    const instrumentation = mock<ArchiverInstrumentation>({ isEnabled: () => true, tracer });
    const archiverStore = new KVArchiverDataStore(await openTmpStore('archiver_misc_test'), 1000);
    const events = new EventEmitter() as ArchiverEmitter;
    const l2TipsCache = new L2TipsCache(archiverStore.blockStore);

    archiver = new Archiver(
      publicClient,
      publicClient,
      rollupContract,
      {
        registryAddress: EthAddress.random(),
        governanceProposerAddress: EthAddress.random(),
        slashingProposerAddress: EthAddress.random(),
      },
      archiverStore,
      { pollingIntervalMs: 1000, batchSize: 1000, maxAllowedEthClientDriftSeconds: 300 },
      blobClient,
      instrumentation,
      l1Constants,
      synchronizer,
      events,
      l2TipsCache,
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
});
