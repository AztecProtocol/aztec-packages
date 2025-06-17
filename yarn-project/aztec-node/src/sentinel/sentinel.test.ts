import type { EpochCache } from '@aztec/epoch-cache';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import type { SlasherConfig } from '@aztec/slasher/config';
import { Offense, WANT_TO_SLASH_EVENT } from '@aztec/slasher/config';
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
import { type MockProxy, mock, mockDeep } from 'jest-mock-extended';

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
    | 'slashInactivityCreateTargetPercentage'
    | 'slashInactivityCreatePenalty'
    | 'slashInactivitySignalTargetPercentage'
    | 'slashInactivityMaxPenalty'
    | 'slashPayloadTtlSeconds'
  > = {
    slashInactivityCreatePenalty: 100n,
    slashInactivityCreateTargetPercentage: 0.8,
    slashInactivitySignalTargetPercentage: 0.6,
    slashInactivityMaxPenalty: 200n,
    slashPayloadTtlSeconds: 60 * 60,
  };

  beforeEach(async () => {
    epochCache = mock<EpochCache>();
    archiver = mock<L2BlockSource>();
    p2p = mock<P2PClient>();
    blockStream = mock<L2BlockStream>();

    kvStore = await openTmpStore('sentinel-test');
    store = new SentinelStore(kvStore, { historyLength: 10 });

    slot = 10n;
    epoch = 0n;
    ts = BigInt(Math.ceil(Date.now() / 1000));
    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: ts,
      slotDuration: 24,
      epochDuration: 8,
      ethereumSlotDuration: 12,
      proofSubmissionWindow: 16,
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

  describe('handleChainProven', () => {
    it('calls inactivity watcher with performance data', async () => {
      const blockNumber = 15;
      const blockHash = '0xblockhash';
      const mockBlock = await randomPublishedL2Block(blockNumber);
      const slot = mockBlock.block.header.getSlot();
      const epochNumber = getEpochAtSlot(slot, l1Constants);
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const headerSlots = times(5, i => slot - BigInt(i));
      const mockHeaders = headerSlots.map(s => {
        const header = mockDeep<PublishedL2Block['block']['header']>();
        header.getSlot.mockReturnValue(s);
        return header;
      });

      epochCache.getEpochAndSlotNow.mockReturnValue({ epoch: epochNumber, slot, ts, now: ts });
      archiver.getBlock.calledWith(blockNumber).mockResolvedValue(mockBlock.block);
      archiver.getL1Constants.mockResolvedValue(l1Constants);

      archiver.getBlockHeadersForEpoch.calledWith(epochNumber).mockResolvedValue(mockHeaders as any);

      epochCache.getCommittee.mockResolvedValue({
        committee: [validator1, validator2],
        seed: 0n,
        epoch: epochNumber,
      });
      const statsResult = {
        stats: {
          [validator1.toString()]: {
            address: validator1,
            totalSlots: headerSlots.length,
            missedProposals: { count: 0, currentStreak: 0, rate: 0 },
            missedAttestations: { count: 1, currentStreak: 0, rate: 1 / 5 },
            history: [
              { slot: headerSlots[0], status: 'attestation-sent' },
              { slot: headerSlots[1], status: 'attestation-missed' },
              { slot: headerSlots[2], status: 'attestation-sent' },
              { slot: headerSlots[3], status: 'attestation-sent' },
              { slot: headerSlots[4], status: 'attestation-sent' },
            ],
          } as ValidatorStats,
          [validator2.toString()]: {
            address: validator2,
            totalSlots: headerSlots.length,
            missedProposals: { count: 0, currentStreak: 0, rate: 0 },
            // We should only count the slots that are in the proven epoch (0, 1, 2)!!
            missedAttestations: { count: 4, currentStreak: 3, rate: 4 / 5 },
            history: [
              { slot: headerSlots[0], status: 'attestation-missed' },
              { slot: headerSlots[1], status: 'attestation-sent' },
              { slot: headerSlots[2], status: 'attestation-missed' },
              { slot: headerSlots[3], status: 'attestation-missed' },
              { slot: headerSlots[4], status: 'attestation-missed' },
            ],
          } as ValidatorStats,
          '0xNotAnAddress': {
            address: EthAddress.ZERO, // Placeholder
            totalSlots: 0,
            missedProposals: { count: 0, currentStreak: 0, rate: undefined },
            missedAttestations: { count: 0, currentStreak: 0, rate: undefined },
            history: [],
          } as ValidatorStats, // To test filtering
        },
        lastProcessedSlot: slot,
        initialSlot: 0n,
        slotWindow: 15,
      } as ValidatorsStats;
      const computeStatsSpy = jest.spyOn(sentinel, 'computeStats').mockResolvedValue(statsResult);
      const emitSpy = jest.spyOn(sentinel, 'emit');

      await sentinel.handleChainProven({ type: 'chain-proven', block: { number: blockNumber, hash: blockHash } });

      expect(computeStatsSpy).toHaveBeenCalledWith({
        fromSlot: headerSlots[0],
        toSlot: headerSlots[headerSlots.length - 1],
      });
      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: validator2,
          amount: config.slashInactivityCreatePenalty,
          offense: Offense.INACTIVITY,
        },
      ]);
    });

    it('should agree with slash', async () => {
      const performance = Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `0x000000000000000000000000000000000000000${i}`,
          {
            missed: i * 10,
            total: 100,
          },
        ]),
      );

      await sentinel.updateProvenPerformance(1n, performance);
      const emitSpy = jest.spyOn(sentinel, 'emit');

      sentinel.handleProvenPerformance(performance);
      const penalty = config.slashInactivityCreatePenalty;

      expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
        {
          validator: EthAddress.fromString(`0x0000000000000000000000000000000000000008`),
          amount: penalty,
          offense: Offense.INACTIVITY,
        },
        {
          validator: EthAddress.fromString(`0x0000000000000000000000000000000000000009`),
          amount: penalty,
          offense: Offense.INACTIVITY,
        },
      ]);

      for (let i = 0; i < 10; i++) {
        const expectedAgree = i >= 6;
        const actualAgree = await sentinel.shouldSlash({
          validator: EthAddress.fromString(`0x000000000000000000000000000000000000000${i}`),
          amount: config.slashInactivityMaxPenalty,
          offense: Offense.INACTIVITY,
        });
        expect(actualAgree).toBe(expectedAgree);

        // We never slash if the penalty is above the max penalty
        await expect(
          sentinel.shouldSlash({
            validator: EthAddress.fromString(`0x000000000000000000000000000000000000000${i}`),
            amount: config.slashInactivityMaxPenalty + 1n,
            offense: Offense.INACTIVITY,
          }),
        ).resolves.toBe(false);
      }
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
      | 'slashInactivityCreateTargetPercentage'
      | 'slashInactivityCreatePenalty'
      | 'slashInactivitySignalTargetPercentage'
      | 'slashInactivityMaxPenalty'
      | 'slashPayloadTtlSeconds'
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

  public override handleProvenPerformance(performance: ValidatorsEpochPerformance) {
    return super.handleProvenPerformance(performance);
  }

  public override updateProvenPerformance(epoch: bigint, performance: ValidatorsEpochPerformance) {
    return super.updateProvenPerformance(epoch, performance);
  }
}
