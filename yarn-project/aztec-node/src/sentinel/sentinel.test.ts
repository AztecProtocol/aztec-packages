import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import { OffenseType, WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '@aztec/slasher';
import type { SlasherConfig } from '@aztec/slasher/config';
import {
  type L2BlockSource,
  type L2BlockStream,
  type L2BlockStreamEvent,
  type PublishedL2Block,
  getAttestationsFromPublishedL2Block,
} from '@aztec/stdlib/block';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type { BlockAttestation } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, randomPublishedL2Block } from '@aztec/stdlib/testing';
import type {
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorsEpochPerformance,
  ValidatorsStats,
} from '@aztec/stdlib/validators';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { Sentinel } from './sentinel.js';
import { SentinelStore } from './store.js';

describe('sentinel', () => {
  let epochCache: MockProxy<EpochCache>;
  let archiver: MockProxy<L2BlockSource>;
  let p2p: MockProxy<P2PClient>;
  let blockStream: MockProxy<L2BlockStream>;

  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;

  let sentinel: TestSentinel;

  let slot: bigint;
  let epoch: bigint;
  let ts: bigint;
  let l1Constants: L1RollupConstants;
  const config: Pick<
    SlasherConfig,
    'slashInactivityTargetPercentage' | 'slashInactivityPenalty' | 'slashInactivityConsecutiveEpochThreshold'
  > = {
    slashInactivityPenalty: 100n,
    slashInactivityTargetPercentage: 0.8,
    slashInactivityConsecutiveEpochThreshold: 1,
  };

  beforeEach(async () => {
    epochCache = mock<EpochCache>();
    archiver = mock<L2BlockSource>();
    p2p = mock<P2PClient>();
    blockStream = mock<L2BlockStream>();

    kvStore = await openTmpStore('sentinel-test');
    store = new SentinelStore(kvStore, { historyLength: 10, historicProvenPerformanceLength: 5 });

    slot = 10n;
    epoch = 0n;
    ts = BigInt(Math.ceil(Date.now() / 1000));
    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: ts,
      slotDuration: 24,
      epochDuration: 8,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
    };

    epochCache.getEpochAndSlotNow.mockReturnValue({ epoch, slot, ts, now: ts });
    epochCache.getL1Constants.mockReturnValue(l1Constants);

    sentinel = new TestSentinel(epochCache, archiver, p2p, store, config, blockStream);
  });

  afterEach(async () => {
    await kvStore.close();
  });

  describe('getSlotActivity', () => {
    let signers: Secp256k1Signer[];
    let validators: EthAddress[];
    let block: PublishedL2Block;
    let attestations: BlockAttestation[];
    let proposer: EthAddress;
    let committee: EthAddress[];

    beforeEach(async () => {
      signers = times(4, Secp256k1Signer.random);
      validators = signers.map(signer => signer.address);
      block = await randomPublishedL2Block(Number(slot));
      attestations = signers.map(signer => makeBlockAttestation({ signer, archive: block.block.archive.root }));
      proposer = validators[0];
      committee = [...validators];

      p2p.getAttestationsForSlot.mockResolvedValue(attestations);
    });

    it('flags block as mined', async () => {
      await sentinel.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-mined');
    });

    it('flags block as proposed when it is not mined but there are attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue(attestations);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-proposed');
    });

    it('flags block as missed when there are no attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue([]);
      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-missed');
    });

    it('identifies attestors from p2p and archiver', async () => {
      block = await randomPublishedL2Block(Number(slot), { signers: signers.slice(0, 2) });
      const attestorsFromBlock = getAttestationsFromPublishedL2Block(block).map(att => att.getSender());
      expect(attestorsFromBlock.map(a => a.toString())).toEqual(signers.slice(0, 2).map(a => a.address.toString()));

      await sentinel.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      p2p.getAttestationsForSlot.mockResolvedValue(attestations.slice(2, 3));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('identifies missed attestors if block is mined', async () => {
      await sentinel.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      p2p.getAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('identifies missed attestors if block is proposed', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue(attestations.slice(0, -1));

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[committee[1].toString()]).toEqual('attestation-sent');
      expect(activity[committee[2].toString()]).toEqual('attestation-sent');
      expect(activity[committee[3].toString()]).toEqual('attestation-missed');
    });

    it('does not tag attestors as missed if there was no block and no attestations', async () => {
      p2p.getAttestationsForSlot.mockResolvedValue([]);

      const activity = await sentinel.getSlotActivity(slot, epoch, proposer, committee);
      expect(activity[proposer.toString()]).toEqual('block-missed');
      expect(activity[committee[1].toString()]).not.toBeDefined();
      expect(activity[committee[2].toString()]).not.toBeDefined();
      expect(activity[committee[3].toString()]).not.toBeDefined();
    });
  });

  describe('computeStatsForValidator', () => {
    let validator: `0x${string}`;

    beforeEach(() => {
      validator = EthAddress.random().toString();
    });

    it('computes stats correctly', () => {
      const stats = sentinel.computeStatsForValidator(validator, [
        { slot: 1n, status: 'block-mined' },
        { slot: 2n, status: 'block-proposed' },
        { slot: 3n, status: 'block-missed' },
        { slot: 4n, status: 'block-missed' },
        { slot: 5n, status: 'attestation-sent' },
        { slot: 6n, status: 'attestation-missed' },
      ]);

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(6);
      expect(stats.missedProposals.count).toEqual(2);
      expect(stats.missedProposals.currentStreak).toEqual(2);
      expect(stats.missedProposals.rate).toEqual(0.5);
      expect(stats.lastProposal?.slot).toEqual(2n);
      expect(stats.missedAttestations.count).toEqual(1);
      expect(stats.missedAttestations.currentStreak).toEqual(1);
      expect(stats.missedAttestations.rate).toEqual(0.5);
      expect(stats.lastAttestation?.slot).toEqual(5n);
    });

    it('resets streaks correctly', () => {
      const stats = sentinel.computeStatsForValidator(validator, [
        { slot: 1n, status: 'block-mined' },
        { slot: 2n, status: 'block-missed' },
        { slot: 3n, status: 'block-mined' },
        { slot: 4n, status: 'block-missed' },
        { slot: 5n, status: 'attestation-sent' },
        { slot: 6n, status: 'attestation-missed' },
        { slot: 7n, status: 'attestation-sent' },
        { slot: 8n, status: 'attestation-missed' },
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
      const history = times(20, i => ({ slot: BigInt(i), status: 'block-missed' }) as const);
      const stats = sentinel.computeStatsForValidator(validator, history, 15n);

      expect(stats.address.toString()).toEqual(validator);
      expect(stats.totalSlots).toEqual(5);
      expect(stats.missedProposals.count).toEqual(5);
    });
  });

  describe('slot range validation', () => {
    let validator: EthAddress;

    beforeEach(() => {
      validator = EthAddress.random();
      jest.spyOn(store, 'getHistoryLength').mockReturnValue(10);
      jest.spyOn(store, 'getHistory').mockResolvedValue([
        { slot: 1n, status: 'block-mined' },
        { slot: 2n, status: 'attestation-sent' },
      ]);
      jest.spyOn(store, 'getHistories').mockResolvedValue({
        [validator.toString()]: [
          { slot: 1n, status: 'block-mined' },
          { slot: 2n, status: 'attestation-sent' },
        ],
      });
    });

    describe('getValidatorStats', () => {
      it('should throw when slot range exceeds history length', async () => {
        await expect(sentinel.getValidatorStats(validator, 1n, 16n)).rejects.toThrow(
          'Slot range (15) exceeds history length (10). Requested range: 1 to 16.',
        );
      });

      it('should not throw when slot range equals history length', async () => {
        await expect(sentinel.getValidatorStats(validator, 1n, 11n)).resolves.toBeDefined();
      });

      it('should not throw when slot range is less than history length', async () => {
        await expect(sentinel.getValidatorStats(validator, 1n, 6n)).resolves.toBeDefined();
      });

      it('should return undefined when validator has no history', async () => {
        jest.spyOn(store, 'getHistory').mockResolvedValue(undefined);
        const result = await sentinel.getValidatorStats(validator, 1n, 6n);
        expect(result).toBeUndefined();
      });

      it('should return undefined when validator has empty history', async () => {
        jest.spyOn(store, 'getHistory').mockResolvedValue([]);
        const result = await sentinel.getValidatorStats(validator, 1n, 6n);
        expect(result).toBeUndefined();
      });

      it('should return expected mocked data structure', async () => {
        const mockHistory: ValidatorStatusHistory = [
          { slot: 1n, status: 'block-mined' },
          { slot: 2n, status: 'attestation-sent' },
        ];
        const mockProvenPerformance = [
          { epoch: 1n, missed: 2, total: 10 },
          { epoch: 2n, missed: 1, total: 8 },
        ];

        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockProvenPerformance);
        jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 2,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        const result = await sentinel.getValidatorStats(validator, 1n, 6n);

        expect(result).toEqual({
          validator: {
            address: validator,
            totalSlots: 2,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            history: mockHistory,
          },
          allTimeProvenPerformance: mockProvenPerformance,
          lastProcessedSlot: sentinel.getLastProcessedSlot(),
          initialSlot: sentinel.getInitialSlot(),
          slotWindow: 10,
        });
      });

      it('should call computeStatsForValidator with correct parameters', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: 5n, status: 'block-mined' }];
        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue([]);
        const computeStatsSpy = jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        await sentinel.getValidatorStats(validator, 3n, 8n);

        expect(computeStatsSpy).toHaveBeenCalledWith(validator.toString(), mockHistory, 3n, 8n);
      });

      it('should use default slot range when not provided', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: 5n, status: 'block-mined' }];
        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue([]);
        const computeStatsSpy = jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        await sentinel.getValidatorStats(validator);

        expect(computeStatsSpy).toHaveBeenCalledWith(validator.toString(), mockHistory, slot - BigInt(10), slot);
      });

      it('should return proven performance data from store', async () => {
        const mockHistory: ValidatorStatusHistory = [{ slot: 1n, status: 'block-mined' }];
        const mockProvenPerformance = [
          { epoch: 5n, missed: 3, total: 12 },
          { epoch: 6n, missed: 0, total: 15 },
        ];

        jest.spyOn(store, 'getHistory').mockResolvedValue(mockHistory);
        const getProvenPerformanceSpy = jest
          .spyOn(store, 'getProvenPerformance')
          .mockResolvedValue(mockProvenPerformance);
        jest.spyOn(sentinel, 'computeStatsForValidator').mockReturnValue({
          address: validator,
          totalSlots: 1,
          missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          missedAttestations: { count: 0, currentStreak: 0, rate: 0, total: 0 },
          history: mockHistory,
        });

        const result = await sentinel.getValidatorStats(validator);

        expect(getProvenPerformanceSpy).toHaveBeenCalledWith(validator);
        expect(result?.allTimeProvenPerformance).toEqual(mockProvenPerformance);
      });
    });
  });

  describe('handleChainProven', () => {
    it('calls inactivity watcher with performance data', async () => {
      const blockNumber = 15;
      const blockHash = '0xblockhash';
      const mockBlock = await randomPublishedL2Block(blockNumber);
      const slot = mockBlock.block.header.getSlot();
      const epochNumber = getEpochAtSlot(slot, l1Constants);
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const validator3 = EthAddress.random();
      const headerSlots = times(l1Constants.epochDuration, i => slot - BigInt(i)).reverse();

      epochCache.getEpochAndSlotNow.mockReturnValue({ epoch: epochNumber, slot, ts, now: ts });
      archiver.getBlock.calledWith(blockNumber).mockResolvedValue(mockBlock.block);
      archiver.getL1Constants.mockResolvedValue(l1Constants);
      epochCache.getL1Constants.mockReturnValue(l1Constants);

      epochCache.getCommittee.mockResolvedValue({
        committee: [validator1, validator2, validator3],
        seed: 0n,
        epoch: epochNumber,
      });

      const statsResult: ValidatorsStats = {
        stats: {
          // Validator 1 missed 1 attestation only, we won't slash them
          [validator1.toString()]: {
            address: validator1,
            totalSlots: headerSlots.length,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 1, currentStreak: 0, rate: 1 / 8, total: 8 },
            history: [],
          },
          // Validator 2 missed 7 out of 8, we will slash them
          [validator2.toString()]: {
            address: validator2,
            totalSlots: headerSlots.length,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 7, currentStreak: 3, rate: 7 / 8, total: 8 },
            history: [],
          },
          // Validator 3 missed 4 attestations out of 4, so we will slash them even though the epoch has 8 slots
          // This difference happens because we don't count attestations for a slot where there was no proposal
          [validator3.toString()]: {
            address: validator3,
            totalSlots: headerSlots.length,
            missedProposals: { count: 0, currentStreak: 0, rate: 0, total: 0 },
            missedAttestations: { count: 4, currentStreak: 4, rate: 4 / 4, total: 4 },
            history: [],
          },
        },
        lastProcessedSlot: slot,
        initialSlot: 0n,
        slotWindow: 15,
      };
      const computeStatsSpy = jest.spyOn(sentinel, 'computeStats').mockResolvedValue(statsResult);
      const emitSpy = jest.spyOn(sentinel, 'emit');

      await sentinel.handleChainProven({ type: 'chain-proven', block: { number: blockNumber, hash: blockHash } });

      expect(computeStatsSpy).toHaveBeenCalledWith({
        fromSlot: headerSlots[0],
        toSlot: headerSlots[headerSlots.length - 1],
        validators: [validator1, validator2, validator3],
      });
      const makeInactivitySlash = (validator: EthAddress): WantToSlashArgs => ({
        validator,
        amount: config.slashInactivityPenalty,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 1n,
      });

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        makeInactivitySlash(validator2),
        makeInactivitySlash(validator3),
      ]);
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
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 4n, missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: 3n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 2n, missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, 6n, 3);

        expect(result).toBe(true);
      });

      it('should return false when validator has not been inactive for required consecutive epochs', async () => {
        // Mock performance data: validator active in middle epoch
        const mockPerformance = [
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 4n, missed: 5, total: 10 }, // 50% missed (active)
          { epoch: 3n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 2n, missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, 6n, 3);

        expect(result).toBe(false);
      });

      it('should return false when insufficient historical data', async () => {
        // Mock performance data: only 2 epochs available, but need 3
        const mockPerformance = [
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 4n, missed: 9, total: 10 }, // 90% missed (inactive)
        ];

        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, 6n, 3);

        expect(result).toBe(false);
      });

      it('should return true when there is a gap in epochs since validators are not chosen for every committee', async () => {
        // Mock performance data: gap in epoch 4
        const mockPerformance = [
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 3n, missed: 8, total: 10 }, // 80% missed (inactive) - missing epoch 4
          { epoch: 2n, missed: 8, total: 10 }, // 80% missed (inactive)
        ];

        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockPerformance);

        const result = await sentinel.checkPastInactivity(validator1, 6n, 3);

        expect(result).toBe(true);
      });

      it('should work with threshold of 0 used when there are no past epochs to inspect', async () => {
        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue([]);
        const result = await sentinel.checkPastInactivity(validator1, 6n, 0);
        expect(result).toBe(true);
      });

      it('should only consider past epochs', async () => {
        // Mock performance data: validator inactive for 3 consecutive epochs
        const mockPerformance = [
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 4n, missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: 3n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 2n, missed: 5, total: 10 }, // 50% missed (active)
        ];

        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue(mockPerformance);

        // Query on epoch 5, so we only consider past ones and don't get to threshold
        const result = await sentinel.checkPastInactivity(validator1, 5n, 3);

        expect(result).toBe(false);
      });
    });

    describe('handleProvenPerformance with consecutive epochs', () => {
      it('should slash validators only after consecutive epoch failures', async () => {
        // Update config to require 2 consecutive epochs
        sentinel.updateConfig({ slashInactivityConsecutiveEpochThreshold: 2 });

        // Mock performance data for two validators
        jest.spyOn(store, 'getProvenPerformance').mockImplementation(validator => {
          if (validator.equals(validator1)) {
            // Validator1: inactive for 2+ consecutive epochs - should be slashed
            return Promise.resolve([
              { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
              { epoch: 4n, missed: 9, total: 10 }, // 90% missed (inactive)
              { epoch: 3n, missed: 5, total: 10 }, // 50% missed (active)
            ]);
          } else {
            // Validator2: inactive only in current epoch - should NOT be slashed
            return Promise.resolve([
              { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
              { epoch: 4n, missed: 5, total: 10 }, // 50% missed (active)
              { epoch: 3n, missed: 5, total: 10 }, // 50% missed (active)
            ]);
          }
        });

        const emitSpy = jest.spyOn(sentinel, 'emit');

        // Current epoch performance: both validators are inactive
        const currentEpochPerformance = {
          [validator1.toString()]: { missed: 8, total: 10 }, // 80% missed
          [validator2.toString()]: { missed: 8, total: 10 }, // 80% missed
        };

        await sentinel.handleProvenPerformance(5n, currentEpochPerformance);

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

      it('should not slash when no validators meet consecutive threshold', async () => {
        // Update config to require 3 consecutive epochs
        sentinel.updateConfig({ slashInactivityConsecutiveEpochThreshold: 3 });

        // Mock performance data: validators only inactive for 2 epochs
        jest.spyOn(store, 'getProvenPerformance').mockResolvedValue([
          { epoch: 5n, missed: 8, total: 10 }, // 80% missed (inactive)
          { epoch: 4n, missed: 9, total: 10 }, // 90% missed (inactive)
          { epoch: 3n, missed: 5, total: 10 }, // 50% missed (active)
        ]);

        const emitSpy = jest.spyOn(sentinel, 'emit');

        const currentEpochPerformance = {
          [validator1.toString()]: { missed: 8, total: 10 }, // 80% missed
        };

        await sentinel.handleProvenPerformance(5n, currentEpochPerformance);

        // Should not emit any slash events
        expect(emitSpy).not.toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, expect.anything());
      });
    });
  });
});

class TestSentinel extends Sentinel {
  constructor(
    epochCache: EpochCache,
    archiver: L2BlockSource,
    p2p: P2PClient,
    store: SentinelStore,
    config: Pick<
      SlasherConfig,
      'slashInactivityTargetPercentage' | 'slashInactivityPenalty' | 'slashInactivityConsecutiveEpochThreshold'
    >,
    protected override blockStream: L2BlockStream,
  ) {
    super(epochCache, archiver, p2p, store, config);
  }

  public override init() {
    this.initialSlot = this.epochCache.getEpochAndSlotNow().slot;
    return Promise.resolve();
  }

  public override getSlotActivity(slot: bigint, epoch: bigint, proposer: EthAddress, committee: EthAddress[]) {
    return super.getSlotActivity(slot, epoch, proposer, committee);
  }

  public override computeStatsForValidator(
    address: `0x${string}`,
    history: ValidatorStatusHistory,
    fromSlot?: bigint,
  ): ValidatorStats {
    return super.computeStatsForValidator(address, history, fromSlot);
  }

  public override handleChainProven(event: L2BlockStreamEvent) {
    return super.handleChainProven(event);
  }

  public override computeStats(opts: { fromSlot?: bigint; toSlot?: bigint }) {
    return super.computeStats(opts);
  }

  public override handleProvenPerformance(epoch: bigint, performance: ValidatorsEpochPerformance) {
    return super.handleProvenPerformance(epoch, performance);
  }

  public override getValidatorStats(validatorAddress: EthAddress, fromSlot?: bigint, toSlot?: bigint) {
    return super.getValidatorStats(validatorAddress, fromSlot, toSlot);
  }

  public getLastProcessedSlot() {
    return this.lastProcessedSlot;
  }

  public getInitialSlot() {
    return this.initialSlot;
  }

  public override checkPastInactivity(validator: EthAddress, currentEpoch: bigint, requiredConsecutiveEpochs: number) {
    return super.checkPastInactivity(validator, currentEpoch, requiredConsecutiveEpochs);
  }
}
