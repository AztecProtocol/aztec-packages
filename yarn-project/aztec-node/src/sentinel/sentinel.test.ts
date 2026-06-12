import { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { compactArray, times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import { OffenseType, WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '@aztec/slasher';
import {
  CommitteeAttestation,
  GENESIS_BLOCK_HEADER_HASH,
  L2Block,
  type L2BlockSource,
  getAttestationInfoFromPublishedCheckpoint,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  CheckpointReexecutionTracker,
  L1PublishedData,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { CheckpointAttestation } from '@aztec/stdlib/p2p';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeCheckpointAttestation,
  makeCheckpointAttestationFromCheckpoint,
} from '@aztec/stdlib/testing';
import type {
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorsEpochPerformance,
  ValidatorsStats,
} from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Sentinel, type SentinelRuntimeConfig } from './sentinel.js';
import { SentinelStore } from './store.js';

describe('sentinel', () => {
  let epochCache: MockProxy<EpochCache>;
  let archiver: MockProxy<L2BlockSource>;
  let p2p: MockProxy<P2PClient>;
  let reexecutionTracker: CheckpointReexecutionTracker;

  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;

  let sentinel: TestSentinel;

  let slot: SlotNumber;
  let epoch: EpochNumber;
  let ts: bigint;
  let l1Constants: L1RollupConstants;
  const config: SentinelRuntimeConfig = {
    slashInactivityPenalty: 100n,
    slashInactivityTargetPercentage: 0.8,
    slashInactivityConsecutiveEpochThreshold: 1,
    sentinelEpochEndBufferSlots: 2,
    l1ChainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId,
    rollupAddress: TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress,
  };

  beforeEach(async () => {
    epochCache = mock<EpochCache>();
    archiver = mock<L2BlockSource>();
    archiver.getGenesisBlockHash.mockReturnValue(GENESIS_BLOCK_HEADER_HASH);
    p2p = mock<P2PClient>();
    reexecutionTracker = new CheckpointReexecutionTracker();

    kvStore = await openTmpStore('sentinel-test');
    store = new SentinelStore(kvStore, { historyLength: 10, historicEpochPerformanceLength: 5 });

    slot = SlotNumber(10);
    epoch = EpochNumber(0);
    ts = BigInt(Math.ceil(Date.now() / 1000));
    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: ts,
      slotDuration: 24,
      epochDuration: 8,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };

    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch,
      slot,
      ts,
      nowMs: ts * 1000n,
    });
    epochCache.getSlotNow.mockReturnValue(slot);
    epochCache.getEpochNow.mockReturnValue(epoch);
    epochCache.getL1Constants.mockReturnValue(l1Constants);

    sentinel = new TestSentinel(epochCache, archiver, p2p, store, reexecutionTracker, config);
  });

  afterEach(async () => {
    await kvStore.close();
  });

  describe('init', () => {
    beforeEach(() => {
      archiver.getBlockNumber.mockResolvedValue(BlockNumber(0));
    });

    it('floors initialSlot at the archiver synced L2 slot when available', async () => {
      const syncedSlot = SlotNumber(7);
      epochCache.getSlotNow.mockReturnValue(SlotNumber(20));
      archiver.getSyncedL2SlotNumber.mockResolvedValue(syncedSlot);

      await sentinel.callProductionInit();

      expect(sentinel.getInitialSlot()).toEqual(syncedSlot);
    });

    it('falls back to the wallclock slot when the archiver is not yet synced', async () => {
      const wallclockSlot = SlotNumber(20);
      epochCache.getSlotNow.mockReturnValue(wallclockSlot);
      archiver.getSyncedL2SlotNumber.mockResolvedValue(undefined);

      await sentinel.callProductionInit();

      expect(sentinel.getInitialSlot()).toEqual(wallclockSlot);
    });
  });

  describe('getSlotActivity', () => {
    let signers: Secp256k1Signer[];
    let validators: EthAddress[];
    let block: L2Block;
    let publishedCheckpoint: PublishedCheckpoint;
    let attestations: CheckpointAttestation[];
    let proposer: EthAddress;
    let committee: EthAddress[];

    /**
     * Stubs the archiver so the slot's on-demand `getCheckpoint({ slot })` lookup returns this checkpoint, mirroring
     * a checkpoint that has landed on L1 covering the slot.
     */
    const mineCheckpointForSlot = (checkpoint: Checkpoint, checkpointAttestations: CommitteeAttestation[] = []) => {
      const published = new PublishedCheckpoint(checkpoint, L1PublishedData.random(), checkpointAttestations);
      const checkpointSlot = checkpoint.header.slotNumber;
      archiver.getCheckpoint.mockImplementation(query =>
        Promise.resolve('slot' in query && query.slot === checkpointSlot ? published : undefined),
      );
      return published;
    };

    beforeEach(async () => {
      // No L1 checkpoint by default; individual tests mine one via mineCheckpointForSlot.
      archiver.getCheckpoint.mockResolvedValue(undefined);
      signers = times(4, Secp256k1Signer.random);
      validators = signers.map(signer => signer.address);
      block = await L2Block.random(BlockNumber(1), { slotNumber: slot });
      attestations = signers.map(signer => makeCheckpointAttestation({ signer, archive: block.archive.root }));
      proposer = validators[0];
      committee = [...validators];

      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations);
    });

    it('flags checkpoint as mined when L1 has it (case 6)', async () => {
      // Create a checkpoint with a block at the target slot and emit chain-checkpointed event
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: slot });
      mineCheckpointForSlot(checkpoint);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-mined');
    });

    it('flags checkpoint as valid when tracker outcome is valid (case 5)', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'valid', CheckpointNumber(1));
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-valid');
    });

    it('flags checkpoint as invalid when tracker outcome is invalid (case 4)', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'invalid', CheckpointNumber(1));
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-invalid');
    });

    it('flags checkpoint as unvalidated when tracker outcome is unvalidated (case 3)', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'unvalidated');
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-unvalidated');
    });

    it('flags as blocks-missed when there is no tracker outcome and no block proposals (case 1)', async () => {
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      p2p.hasBlockProposalsForSlot.mockResolvedValue(false);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('blocks-missed');
    });

    it('flags as checkpoint-missed when block proposals exist but no checkpoint proposal (case 2)', async () => {
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      p2p.hasBlockProposalsForSlot.mockResolvedValue(true);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-missed');
    });

    it('prefers L1-mined over tracker outcome', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'invalid', CheckpointNumber(1));
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: slot });
      mineCheckpointForSlot(checkpoint);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-mined');
    });

    it('identifies attestors from p2p and archiver', async () => {
      // Create a checkpoint with a block at the target slot
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: slot });
      // Create attestations from signers 0 and 1
      const checkpointAttestations = signers.slice(0, 2).map(signer => {
        const blockAttestation = makeCheckpointAttestationFromCheckpoint(checkpoint, signer, signer);
        return new CommitteeAttestation(signer.address, blockAttestation.signature);
      });

      // Emit the chain-checkpointed event with attestations from signers 0 and 1
      publishedCheckpoint = mineCheckpointForSlot(checkpoint, checkpointAttestations);

      const attestorsFromCheckpoint = compactArray(
        getAttestationInfoFromPublishedCheckpoint(publishedCheckpoint, TEST_COORDINATION_SIGNATURE_CONTEXT).map(info =>
          info.status === 'recovered-from-signature' || info.status === 'provided-as-address'
            ? info.address
            : undefined,
        ),
      );
      expect(attestorsFromCheckpoint.map(a => a.toString())).toEqual(
        signers.slice(0, 2).map(a => a.address.toString()),
      );

      // P2P provides attestation from signer 2 (validator 2)
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations.slice(2, 3));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      // Validator 1 attested via archiver checkpoint data
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      // Validator 2 attested via p2p
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      // Validator 3 has no attestation
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('only counts recovered-from-signature attestations, not placeholder attestations', async () => {
      // Create a checkpoint with only 2 signers (validators 0 and 1), plus placeholders for 2 and 3
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: slot });

      // Create attestations from first 2 signers
      const signedAttestations = signers.slice(0, 2).map(signer => {
        const blockAttestation = makeCheckpointAttestationFromCheckpoint(checkpoint, signer, signer);
        return new CommitteeAttestation(signer.address, blockAttestation.signature);
      });

      // Add placeholder attestations for the missing validators (no signature)
      const placeholderAttestations = validators.slice(2).map(addr => CommitteeAttestation.fromAddress(addr));

      // Combine signed and placeholder attestations
      const allAttestations = [...signedAttestations, ...placeholderAttestations];

      // Emit chain-checkpointed event with both signed and placeholder attestations
      // The Sentinel should only count the recovered-from-signature ones
      publishedCheckpoint = mineCheckpointForSlot(checkpoint, allAttestations);

      // Verify that getAttestationInfoFromPublishedCheckpoint returns 4 entries total:
      // - 2 with status 'recovered-from-signature' (actual attestations with valid signatures)
      // - 2 with status 'provided-as-address' (placeholders for missing validators)
      const attestationInfo = getAttestationInfoFromPublishedCheckpoint(
        publishedCheckpoint,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      );
      expect(attestationInfo).toHaveLength(4);
      const recoveredSignatures = attestationInfo.filter(info => info.status === 'recovered-from-signature');
      const placeholders = attestationInfo.filter(info => info.status === 'provided-as-address');
      expect(recoveredSignatures).toHaveLength(2);
      expect(placeholders).toHaveLength(2);

      // No additional attestations from p2p
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);

      // Validators 0 and 1 should be marked as having sent attestations (proposer is validator 0, so checkpoint-mined)
      expect(activity[committee[0].toString()]).toEqual('checkpoint-mined');
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');

      // Validators 2 and 3 should be marked as having missed attestations (not counted as sent despite placeholders)
      expect(activity[committee[2].toString()]).toEqual('attestation-missed');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('identifies missed attestors if block is mined', async () => {
      // Create checkpoint with a block at the target slot
      const checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: slot });
      mineCheckpointForSlot(checkpoint);

      // P2P provides attestations from validators 0, 1, 2 (not validator 3)
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('identifies missed attestors when checkpoint proposal was re-executed valid', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'valid', CheckpointNumber(1));
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-valid');
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('does not tag attestors as missed if there was no block and no attestations (case 1)', async () => {
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      p2p.hasBlockProposalsForSlot.mockResolvedValue(false);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('blocks-missed');
      expect(activity[committee[1].toString()]).not.toBeDefined();
      expect(activity[committee[2].toString()]).not.toBeDefined();
      expect(activity[committee[3].toString()]).not.toBeDefined();
    });

    it('does not tag attestors as missed if blocks were proposed but checkpoint was missed (case 2)', async () => {
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
      p2p.hasBlockProposalsForSlot.mockResolvedValue(true);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-missed');
      expect(activity[committee[1].toString()]).not.toBeDefined();
      expect(activity[committee[2].toString()]).not.toBeDefined();
      expect(activity[committee[3].toString()]).not.toBeDefined();
    });

    it('does not tag attestors as missed when checkpoint is unvalidated (case 3)', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'unvalidated');
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-unvalidated');
      // committee[1..3] should not be tagged as missed even though they didn't all attest
      expect(activity[committee[3].toString()]).not.toBe('attestation-missed');
    });

    it('does not tag attestors as missed when checkpoint is invalid (case 4)', async () => {
      reexecutionTracker.recordOutcome(slot, block.archive.root, 'invalid', CheckpointNumber(1));
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('checkpoint-invalid');
      expect(activity[committee[3].toString()]).not.toBe('attestation-missed');
    });
  });

  describe('computeStatsForValidator', () => {
    let validator: `0x${string}`;

    beforeEach(() => {
      validator = EthAddress.random().toString();
    });

    it('computes stats correctly', () => {
      const stats = sentinel.computeStatsForValidator(validator, [
        { slot: SlotNumber(1), status: 'checkpoint-mined' },
        { slot: SlotNumber(2), status: 'checkpoint-valid' },
        { slot: SlotNumber(3), status: 'checkpoint-missed' },
        { slot: SlotNumber(4), status: 'blocks-missed' },
        { slot: SlotNumber(5), status: 'attestation-sent' },
        { slot: SlotNumber(6), status: 'attestation-missed' },
      ]);

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(6);
      expect(stats.missedProposals.count).toEqual(2);
      expect(stats.missedProposals.currentStreak).toEqual(2);
      expect(stats.missedProposals.rate).toEqual(0.5);
      expect(stats.lastProposal?.slot).toEqual(SlotNumber(2));
      expect(stats.missedAttestations.count).toEqual(1);
      expect(stats.missedAttestations.currentStreak).toEqual(1);
      expect(stats.missedAttestations.rate).toEqual(0.5);
      expect(stats.lastAttestation?.slot).toEqual(SlotNumber(5));
    });

    it('counts checkpoint-invalid and checkpoint-unvalidated as missed proposals', () => {
      const stats = sentinel.computeStatsForValidator(validator, [
        { slot: SlotNumber(1), status: 'checkpoint-mined' },
        { slot: SlotNumber(2), status: 'checkpoint-invalid' },
        { slot: SlotNumber(3), status: 'checkpoint-unvalidated' },
        { slot: SlotNumber(4), status: 'checkpoint-missed' },
        { slot: SlotNumber(5), status: 'blocks-missed' },
      ]);
      expect(stats.missedProposals.count).toEqual(4);
      expect(stats.missedProposals.total).toEqual(5);
    });

    it('resets streaks correctly', () => {
      const stats = sentinel.computeStatsForValidator(validator, [
        { slot: SlotNumber(1), status: 'checkpoint-mined' },
        { slot: SlotNumber(2), status: 'blocks-missed' },
        { slot: SlotNumber(3), status: 'checkpoint-mined' },
        { slot: SlotNumber(4), status: 'blocks-missed' },
        { slot: SlotNumber(5), status: 'attestation-sent' },
        { slot: SlotNumber(6), status: 'attestation-missed' },
        { slot: SlotNumber(7), status: 'attestation-sent' },
        { slot: SlotNumber(8), status: 'attestation-missed' },
      ]);

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(8);
      expect(stats.missedProposals.count).toEqual(2);
      expect(stats.missedProposals.currentStreak).toEqual(1);
      expect(stats.missedProposals.rate).toEqual(0.5);
      expect(stats.missedAttestations.count).toEqual(2);
      expect(stats.missedAttestations.currentStreak).toEqual(1);
      expect(stats.missedAttestations.rate).toEqual(0.5);
    });

    it('considers only latest slots', () => {
      const history = times(20, i => ({ slot: SlotNumber(i), status: 'blocks-missed' }) as const);
      const stats = sentinel.computeStatsForValidator(validator, history, SlotNumber(15));

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(5);
      expect(stats.missedProposals.count).toEqual(5);
    });

    it('filters history by toSlot parameter', () => {
      const history = times(20, i => ({ slot: SlotNumber(i), status: 'blocks-missed' }) as const);
      const stats = sentinel.computeStatsForValidator(validator, history, SlotNumber(5), SlotNumber(10));

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(6); // Slots 5-10 inclusive
      expect(stats.missedProposals.count).toEqual(6);
      expect(stats.missedProposals.rate).toEqual(1);
    });
  });

  describe('slot range validation', () => {
    let validator: EthAddress;

    beforeEach(() => {
      validator = EthAddress.random();
      jest.spyOn(store, 'getHistoryLength').mockReturnValue(10);
      jest.spyOn(store, 'getHistory').mockResolvedValue([
        { slot: SlotNumber(1), status: 'checkpoint-mined' },
        { slot: SlotNumber(2), status: 'attestation-sent' },
      ]);
      jest.spyOn(store, 'getHistories').mockResolvedValue({
        [validator.toString()]: [
          { slot: SlotNumber(1), status: 'checkpoint-mined' },
          { slot: SlotNumber(2), status: 'attestation-sent' },
        ],
      });
    });

    describe('getValidatorStats', () => {
      it('should throw when slot range exceeds history length', async () => {
        await expect(sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(16))).rejects.toThrow(
          'Slot range (15) exceeds history length (10). Requested range: 1 to 16.',
        );
      });

      it('should not throw when slot range equals history length', async () => {
        await expect(sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(11))).resolves.toBeDefined();
      });

      it('should not throw when slot range is less than history length', async () => {
        await expect(sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(6))).resolves.toBeDefined();
      });

      it('should return undefined when validator has no history', async () => {
        jest.spyOn(store, 'getHistory').mockResolvedValue(undefined);
        const result = await sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(6));
        expect(result).toBeUndefined();
      });

      it('should return undefined when validator has empty history', async () => {
        jest.spyOn(store, 'getHistory').mockResolvedValue([]);
        const result = await sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(6));
        expect(result).toBeUndefined();
      });

      it('should return expected mocked data structure', async () => {
        const mockHistory: ValidatorStatusHistory = [
          { slot: SlotNumber(1), status: 'checkpoint-mined' },
          { slot: SlotNumber(2), status: 'attestation-sent' },
        ];
        const mockProvenPerformance = [
          { epoch: EpochNumber(1), missed: 2, total: 10 },
          { epoch: EpochNumber(2), missed: 1, total: 8 },
        ];

        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockProvenPerformance);
        jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 2,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        const result = await sentinel.getValidatorStats(validator, SlotNumber(1), SlotNumber(6));

        expect(result).toEqual({
          validator: {
            address: validator,
            totalSlots: 2,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            history: mockHistory,
          },
          allTimeEpochPerformance: mockProvenPerformance,
          lastProcessedSlot: sentinel.getLastProcessedSlot(),
          initialSlot: sentinel.getInitialSlot(),
          slotWindow: 10,
        });
      });

      it('should call computeStatsForValidator with correct parameters', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: SlotNumber(5), status: 'checkpoint-mined' }];
        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue([]);
        const computeStatsSpy = jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        await sentinel.getValidatorStats(validator, SlotNumber(3), SlotNumber(8));

        expect(computeStatsSpy).toHaveBeenCalledWith(validator.toString(), mockHistory, SlotNumber(3), SlotNumber(8));
      });

      it('should use default slot range when not provided', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: SlotNumber(5), status: 'checkpoint-mined' }];
        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue([]);
        const computeStatsSpy = jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        await sentinel.getValidatorStats(validator);

        expect(computeStatsSpy).toHaveBeenCalledWith(
          validator.toString(),
          mockHistory,
          SlotNumber(slot - 10),
          SlotNumber(slot),
        );
      });

      it('should not produce negative slot numbers when historyLength exceeds lastProcessedSlot', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: SlotNumber(2), status: 'checkpoint-mined' }];
        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue([]);
        jest.spyOn(store, 'getHistoryLength').mockReturnValue(1000); // Large history length

        // Set lastProcessedSlot to a small value
        sentinel.setLastProcessedSlot(SlotNumber(5));

        const computeStatsSpy = jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        await sentinel.getValidatorStats(validator);

        // Should use SlotNumber(0) instead of negative value (5 - 1000 = -995)
        expect(computeStatsSpy).toHaveBeenCalledWith(
          validator.toString(),
          mockHistory,
          SlotNumber(0), // Math.max((5 - 1000), 0) = 0
          SlotNumber(5),
        );
      });

      it('should return proven performance data from store', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: SlotNumber(1), status: 'checkpoint-mined' }];
        const mockProvenPerformance = [
          { epoch: EpochNumber(5), missed: 3, total: 12 },
          { epoch: EpochNumber(6), missed: 0, total: 15 },
        ];

        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        const getEpochPerformanceSpy = jest
          .spyOn(store, 'getEpochPerformance')
          .mockResolvedValue(mockProvenPerformance);
        jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        const result = await sentinel.getValidatorStats(validator);

        expect(getEpochPerformanceSpy).toHaveBeenCalledWith(validator);
        expect(result?.allTimeEpochPerformance).toEqual(mockProvenPerformance);
      });
    });

    describe('computeStats', () => {
      beforeEach(() => {
        jest.spyOn(store, 'getHistoryLength').mockReturnValue(10);
      });

      it('should not produce negative slot numbers when historyLength exceeds lastProcessedSlot', async () => {
        const validator = EthAddress.random();
        const mockHistories = {
          [validator.toString()]: [{ slot: SlotNumber(2), status: 'checkpoint-mined' as const }],
        };
        jest.spyOn(store, 'getHistories').mockResolvedValue(mockHistories);
        jest.spyOn(store, 'getHistoryLength').mockReturnValue(1000); // Large history length

        // Set lastProcessedSlot to a small value
        sentinel.setLastProcessedSlot(SlotNumber(5));

        const result = await sentinel.computeStats({});

        // The fromSlot should be 0 (Math.max(5 - 1000, 0) = 0), not negative
        expect(result.stats[validator.toString()]).toBeDefined();
        expect(result.lastProcessedSlot).toEqual(SlotNumber(5));

        // Verify the validator stats were computed with the correct slot range
        const validatorStats = result.stats[validator.toString()];
        expect(validatorStats.totalSlots).toBe(1); // Only slot 2 falls in range [0, 5]
      });

      it('should use default fromSlot when lastProcessedSlot minus historyLength is positive', async () => {
        const validator = EthAddress.random();
        const mockHistories = {
          [validator.toString()]: [
            { slot: SlotNumber(95), status: 'checkpoint-mined' as const },
            { slot: SlotNumber(100), status: 'attestation-sent' as const },
          ],
        };
        jest.spyOn(store, 'getHistories').mockResolvedValue(mockHistories);
        jest.spyOn(store, 'getHistoryLength').mockReturnValue(10);

        // Set lastProcessedSlot to a value where subtraction is positive
        sentinel.setLastProcessedSlot(SlotNumber(100));

        const result = await sentinel.computeStats({});

        // The fromSlot should be 90 (100 - 10 = 90)
        expect(result.stats[validator.toString()]).toBeDefined();
        expect(result.lastProcessedSlot).toEqual(SlotNumber(100));

        // Both slots 95 and 100 should be included in range [90, 100]
        const validatorStats = result.stats[validator.toString()];
        expect(validatorStats.totalSlots).toBe(2);
      });
    });
  });

  describe('handleEpochEnd', () => {
    it('calls inactivity watcher with performance data', async () => {
      const epochNumber = EpochNumber(2);
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const validator3 = EthAddress.random();
      const [fromSlot, toSlot] = getSlotRangeForEpoch(epochNumber, l1Constants);

      epochCache.getCommittee.mockResolvedValue({
        committee: [validator1, validator2, validator3],
        seed: 0n,
        epoch: epochNumber,
        isEscapeHatchOpen: false,
      });

      const statsResult: ValidatorsStats = {
        stats: {
          // Validator 1 missed 1 attestation only, we won't slash them
          [validator1.toString()]: {
            address: validator1,
            totalSlots: l1Constants.epochDuration,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 1, currentStreak: 0, rate: 1 / 8, total: 8 },
            history: [],
          },
          // Validator 2 missed 7 out of 8, we will slash them
          [validator2.toString()]: {
            address: validator2,
            totalSlots: l1Constants.epochDuration,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 7, currentStreak: 3, rate: 7 / 8, total: 8 },
            history: [],
          },
          // Validator 3 missed 4 attestations out of 4, so we will slash them even though the epoch has 8 slots
          // This difference happens because we don't count attestations for a slot where there was no proposal
          [validator3.toString()]: {
            address: validator3,
            totalSlots: l1Constants.epochDuration,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 4, currentStreak: 4, rate: 4 / 4, total: 4 },
            history: [],
          },
        },
        lastProcessedSlot: SlotNumber(toSlot),
        initialSlot: SlotNumber(0),
        slotWindow: 15,
      };
      const computeStatsSpy = jest.spyOn(sentinel, 'computeStats').mockResolvedValue(statsResult);
      const emitSpy = jest.spyOn(sentinel, 'emit');

      await sentinel.handleEpochEnd(epochNumber);

      expect(computeStatsSpy).toHaveBeenCalledWith({
        fromSlot,
        toSlot,
        validators: [validator1, validator2, validator3],
      });
      const makeInactivitySlash = (validator: EthAddress): WantToSlashArgs => ({
        validator,
        amount: config.slashInactivityPenalty,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: BigInt(epochNumber),
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        makeInactivitySlash(validator2),
        makeInactivitySlash(validator3),
      ]);
    });
  });

  describe('escape hatch', () => {
    it('processSlot skips tracking when escape hatch is open', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const committee = [validator1, validator2];

      epochCache.getCommittee.mockResolvedValue({
        committee,
        seed: 0n,
        epoch,
        isEscapeHatchOpen: true,
      });

      const updateSpy = jest.spyOn(store, 'updateValidators');

      await sentinel.doProcessSlot(slot);

      // Should NOT have called updateValidators since escape hatch is open
      expect(updateSpy).not.toHaveBeenCalled();
      // But lastProcessedSlot should still advance
      expect(sentinel.getLastProcessedSlot()).toEqual(slot);
    });

    it('processSlot tracks normally when escape hatch is closed', async () => {
      const signers = times(4, Secp256k1Signer.random);
      const validators = signers.map(s => s.address);
      const committee = [...validators];

      epochCache.getCommittee.mockResolvedValue({
        committee,
        seed: 0n,
        epoch,
        isEscapeHatchOpen: false,
      });
      epochCache.computeProposerIndex.mockReturnValue(0n);
      p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);

      const updateSpy = jest.spyOn(store, 'updateValidators');

      await sentinel.doProcessSlot(slot);

      // Should have called updateValidators since escape hatch is closed
      expect(updateSpy).toHaveBeenCalled();
      expect(sentinel.getLastProcessedSlot()).toEqual(slot);
    });

    it('handleEpochEnd skips epoch performance when escape hatch is open', async () => {
      const epochNumber = EpochNumber(2);
      const validator1 = EthAddress.random();

      epochCache.getCommittee.mockResolvedValue({
        committee: [validator1],
        seed: 0n,
        epoch: epochNumber,
        isEscapeHatchOpen: true,
      });

      const emitSpy = jest.spyOn(sentinel, 'emit');
      const updateEpochSpy = jest.spyOn(store, 'updateEpochPerformance');

      await sentinel.handleEpochEnd(epochNumber);

      // Should have stored empty performance (no offenses during escape hatch)
      expect(updateEpochSpy).toHaveBeenCalledWith(epochNumber, {});
      // Should NOT have emitted any slash events
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('consecutive epoch inactivity', () => {
    let validator1: EthAddress;
    let validator2: EthAddress;

    beforeEach(() => {
      validator1 = EthAddress.random();
      validator2 = EthAddress.random();
    });

    describe('checkConsecutiveInactivity', () => {
      it('should return true when validator has required consecutive epochs of inactivity', async () => {
        // Mock performance data: validator inactive for 3 consecutive epochs
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: EpochNumber(3), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(2), missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 3);

        expect(result).toBe(true);
      });

      it('should return false when validator has not been inactive for required consecutive epochs', async () => {
        // Mock performance data: validator active in middle epoch
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 5, total: 10 }, // 50% missed (active)
          { epoch: EpochNumber(3), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(2), missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 3);

        expect(result).toBe(false);
      });

      it('should return false when insufficient historical data', async () => {
        // Mock performance data: only 2 epochs available, but need 3
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 3);

        expect(result).toBe(false);
      });

      it('should return false on first inactive epoch', async () => {
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        // We are checking at epoch 4, so no past epochs
        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(4), 2);

        expect(result).toBe(false);
      });

      it('should return true when there is a gap in epochs since validators are not chosen for every committee', async () => {
        // Mock performance data: gap in epoch 4
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(3), missed: 8, total: 10 }, // 80% missed (inactive) - missing epoch 4
          { epoch: EpochNumber(2), missed: 8, total: 10 }, // 80% missed (inactive)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 3);

        expect(result).toBe(true);
      });

      it('should work with threshold of 0 used when there are no past epochs to inspect', async () => {
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue([]);
        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 0);
        expect(result).toBe(true);
      });

      it('should only consider past epochs', async () => {
        // Mock performance data: validator inactive for 3 consecutive epochs
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: EpochNumber(3), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(2), missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        // Query on epoch 5, so we only consider past ones and don't get to threshold
        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(5), 3);

        expect(result).toBe(false);
      });

      it('should not divide by zero when an epoch has total 0 (treat as not inactive)', async () => {
        const mockPerformance = [
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 8, total: 0 }, // total 0 -> guard: do not divide; treat as not inactive
          { epoch: EpochNumber(3), missed: 8, total: 10 }, // 80% missed (inactive)
        ];

        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, EpochNumber(6), 3);

        // Epoch 4 has total 0 so it must not count as inactive; we don't have 3 consecutive inactive epochs
        expect(result).toBe(false);
      });
    });

    describe('handleEpochPerformance with consecutive epochs', () => {
      it('should slash validators only after consecutive epoch failures', async () => {
        // Update config to require 2 consecutive epochs
        sentinel.updateConfig({ slashInactivityConsecutiveEpochThreshold: 2 });

        // Mock performance data for two validators
        jest.spyOn(store, 'getEpochPerformance').mockImplementation(validator => {
          if (validator.equals(validator1)) {
            // Validator1: inactive for 2+ consecutive epochs - should be slashed
            return Promise.resolve([
              { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
              { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
              { epoch: EpochNumber(3), missed: 5, total: 10 }, // 50% missed (active)
            ]);
          } else {
            // Validator2: inactive only in current epoch - should NOT be slashed
            return Promise.resolve([
              { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
              { epoch: EpochNumber(4), missed: 5, total: 10 }, // 50% missed (active)
              { epoch: EpochNumber(3), missed: 5, total: 10 }, // 50% missed (active)
            ]);
          }
        });

        const emitSpy = jest.spyOn(sentinel, 'emit');

        // Current epoch performance: both validators are inactive
        const currentEpochPerformance = {
          [validator1.toString()]: { missed: 8, total: 10 }, // 80% missed
          [validator2.toString()]: { missed: 8, total: 10 }, // 80% missed
        };

        await sentinel.handleEpochPerformance(EpochNumber(5), currentEpochPerformance);

        // Should only slash validator1 (2 consecutive epochs), not validator2 (1 epoch)
        expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
          {
            validator: validator1,
            amount: config.slashInactivityPenalty,
            offenseType: OffenseType.INACTIVITY,
            epochOrSlot: 5n,
          },
        ]);
      });

      it('emits zero-amount inactivity offenses when the penalty is zero', async () => {
        sentinel.updateConfig({ slashInactivityPenalty: 0n, slashInactivityConsecutiveEpochThreshold: 1 });
        const emitSpy = jest.spyOn(sentinel, 'emit');

        await sentinel.handleEpochPerformance(EpochNumber(5), {
          [validator1.toString()]: { missed: 8, total: 10 },
        });

        expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
          {
            validator: validator1,
            amount: 0n,
            offenseType: OffenseType.INACTIVITY,
            epochOrSlot: 5n,
          },
        ]);
      });

      it('should not slash when no validators meet consecutive threshold', async () => {
        // Update config to require 3 consecutive epochs
        sentinel.updateConfig({ slashInactivityConsecutiveEpochThreshold: 3 });

        // Mock performance data: validators only inactive for 2 epochs
        jest.spyOn(store, 'getEpochPerformance').mockResolvedValue([
          { epoch: EpochNumber(5), missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: EpochNumber(4), missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: EpochNumber(3), missed: 5, total: 10 }, // 50% missed (active)
        ]);

        const emitSpy = jest.spyOn(sentinel, 'emit');

        const currentEpochPerformance = {
          [validator1.toString()]: { missed: 8, total: 10 }, // 80% missed
        };

        await sentinel.handleEpochPerformance(EpochNumber(5), currentEpochPerformance);

        // Should not emit any slash events
        expect(emitSpy).not.toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, expect.anything());
      });
    });
  });
});

class TestSentinel extends Sentinel {
  public override init() {
    this.initialSlot = this.epochCache.getEpochAndSlotNow().slot;
    return Promise.resolve();
  }

  /** Invokes the production Sentinel.init() so tests can assert its initialSlot logic. */
  public callProductionInit() {
    return super.init();
  }

  public override getSlotActivity(slot: SlotNumber, epoch: EpochNumber, proposer: EthAddress, committee: EthAddress[]) {
    return super.getSlotActivity(slot, epoch, proposer, committee);
  }

  public override computeStatsForValidator(
    address: `0x${string}`,
    history: ValidatorStatusHistory,
    fromSlot?: SlotNumber,
    toSlot?: SlotNumber,
  ): ValidatorStats {
    return super.computeStatsForValidator(address, history, fromSlot, toSlot);
  }

  public override handleEpochEnd(epoch: EpochNumber) {
    return super.handleEpochEnd(epoch);
  }

  public override computeStats(opts: { fromSlot?: SlotNumber; toSlot?: SlotNumber }) {
    return super.computeStats(opts);
  }

  public override handleEpochPerformance(epoch: EpochNumber, performance: ValidatorsEpochPerformance) {
    return super.handleEpochPerformance(epoch, performance);
  }

  public override getValidatorStats(validatorAddress: EthAddress, fromSlot?: SlotNumber, toSlot?: SlotNumber) {
    return super.getValidatorStats(validatorAddress, fromSlot, toSlot);
  }

  public getLastProcessedSlot() {
    return this.lastProcessedSlot;
  }

  public setLastProcessedSlot(slot: SlotNumber) {
    this.lastProcessedSlot = slot;
  }

  public getInitialSlot() {
    return this.initialSlot;
  }

  public override checkPastInactivity(
    validator: EthAddress,
    currentEpoch: EpochNumber,
    requiredConsecutiveEpochs: number,
  ) {
    return super.checkPastInactivity(validator, currentEpoch, requiredConsecutiveEpochs);
  }

  public doProcessSlot(slot: SlotNumber) {
    return super.processSlot(slot);
  }
}
