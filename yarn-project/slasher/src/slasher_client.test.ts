import type { EpochCache } from '@aztec/epoch-cache';
import { RollupContract, SlasherContract, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryFastUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type Offense, OffenseType, type ProposerSlashAction } from '@aztec/stdlib/slashing';
import { Metrics } from '@aztec/telemetry-client';
import { BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { jest } from '@jest/globals';
import { type MockProxy, mockDeep } from 'jest-mock-extended';
import assert from 'node:assert';
import type { Hex } from 'viem';

import { DefaultSlasherConfig } from './config.js';
import { SlasherMetrics } from './metrics.js';
import { SlasherClient, type SlasherSettings } from './slasher_client.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import { DummyWatcher } from './test/dummy_watcher.js';
import type { WantToSlashArgs } from './watcher.js';

describe('SlasherClient', () => {
  let slasherClient: TestSlasherClient;
  let slashingProposer: MockProxy<SlashingProposerContract>;
  let rollup: MockProxy<RollupContract>;
  let slasherContract: MockProxy<SlasherContract>;
  let dummyWatcher: DummyWatcher;
  let kvStore: ReturnType<typeof openTmpStore>;
  let offensesStore: SlasherOffensesStore;
  let dateProvider: DateProvider;
  let logger: Logger;
  let mockEpochCache: MockProxy<EpochCache>;
  let telemetryClient: BenchmarkTelemetryClient;

  let committee: EthAddress[];

  const slashingUnit = 1000000000000000000n; // 1 ETH in wei
  const roundSizeInEpochs = 4;
  const epochDuration = 32;
  const roundSize = roundSizeInEpochs * epochDuration;
  const settings: SlasherSettings = {
    slashingExecutionDelayInRounds: 2,
    slashingRoundSize: roundSize,
    slashingRoundSizeInEpochs: roundSizeInEpochs,
    epochDuration: epochDuration,
    slashingLifetimeInRounds: 10,
    slashingOffsetInRounds: 2,
    slashingAmounts: [slashingUnit, slashingUnit * 2n, slashingUnit * 3n],
    targetCommitteeSize: 100,
    l1GenesisTime: BigInt(Math.floor(Date.now() / 1000) - 10000),
    slotDuration: 4,
    slashingQuorumSize: 110,
    rollupRegisteredAtL2Slot: SlotNumber(0),
  };

  const config: SlasherConfig = {
    ...DefaultSlasherConfig,
    slashGracePeriodL2Slots: 10,
    slashMaxPayloadSize: 100,
    slashExecuteRoundsLookBack: 0,
  };

  const executableRoundData = {
    isExecuted: false,
    voteCount: 150n,
  };

  const executedRoundData = {
    isExecuted: true,
    voteCount: 150n,
  };

  const emptyRoundData = {
    isExecuted: false,
    voteCount: 0n,
  };

  const createOffense = (
    opts: {
      validator?: EthAddress;
      amount?: bigint;
      offenseType?: OffenseType;
      epochOrSlot?: bigint;
    } = {},
  ): Offense => {
    const {
      validator = committee[0],
      amount = slashingUnit,
      offenseType = OffenseType.INACTIVITY,
      epochOrSlot = 100n,
    } = opts;

    return { validator, amount, offenseType, epochOrSlot };
  };

  const addOffense = async (opts: Parameters<typeof createOffense>[0] = {}): Promise<Offense> => {
    const offense = createOffense(opts);
    await offensesStore.addOffense(offense);
    return offense;
  };

  const expectActionVoteOffenses = (action: ProposerSlashAction, expectedRound: bigint, expectedVotes: number[]) => {
    expect(action.type).toBe('vote-offenses');
    assert(action.type === 'vote-offenses');
    expect(action.round).toEqual(expectedRound);
    expect(action.votes).toBeDefined();
    expect(action.committees).toBeDefined();
    expect(action.votes.slice(0, expectedVotes.length)).toEqual(expectedVotes);
  };

  const expectActionExecuteSlash = (action: ProposerSlashAction, expectedRound: bigint) => {
    expect(action.type).toBe('execute-slash');
    assert(action.type === 'execute-slash');
    expect(action.round).toEqual(expectedRound);
  };

  beforeEach(() => {
    kvStore = openTmpStore(true);
    offensesStore = new SlasherOffensesStore(kvStore, {
      ...settings,
      slashOffenseExpirationRounds: config.slashOffenseExpirationRounds,
    });
    dummyWatcher = new DummyWatcher();
    dateProvider = new DateProvider();
    logger = createLogger('test');
    telemetryClient = new BenchmarkTelemetryClient();
    committee = times(settings.targetCommitteeSize, i => EthAddress.fromNumber(i + 1));

    // Create mock EpochCache
    mockEpochCache = mockDeep<EpochCache>();
    mockEpochCache.getCommitteeForEpoch.mockImplementation(epoch =>
      Promise.resolve({ committee, seed: 0n, epoch, isEscapeHatchOpen: false }),
    );
    mockEpochCache.getL1Constants.mockReturnValue({
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      slotDuration: 4,
      epochDuration: 32,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 8,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    });

    // Create mocks for L1 contracts
    slashingProposer = mockDeep<SlashingProposerContract>();
    rollup = mockDeep<RollupContract>();
    slasherContract = mockDeep<SlasherContract>();

    // Setup mock responses
    slashingProposer.getRound.mockResolvedValue({ ...emptyRoundData });
    slashingProposer.getTally.mockResolvedValue({
      actions: [{ validator: committee[0], slashAmount: slashingUnit }],
      committees: [committee],
    });
    slashingProposer.getPayload.mockResolvedValue({
      address: EthAddress.random(),
      actions: [{ validator: committee[0], slashAmount: slashingUnit }],
    });
    slashingProposer.isRoundReadyToExecute.mockResolvedValue(true);

    // Setup rollup and slasher contract mocks
    rollup.getSlasherContract.mockResolvedValue(slasherContract);
    slasherContract.isPayloadVetoed.mockResolvedValue(false);
    slasherContract.isSlashingEnabled.mockResolvedValue(true);

    // Mock event listeners to return unwatch functions
    slashingProposer.listenToVoteCast.mockReturnValue(() => {});
    slashingProposer.listenToRoundExecuted.mockReturnValue(() => {});

    // Create consensus slasher client with proper constructor parameters
    slasherClient = new TestSlasherClient(
      config,
      settings,
      slashingProposer,
      slasherContract,
      rollup,
      [dummyWatcher],
      mockEpochCache,
      dateProvider,
      offensesStore,
      logger,
      new SlasherMetrics(telemetryClient),
    );
  });

  afterEach(async () => {
    await slasherClient.stop();
    await kvStore.close();
  });

  describe('getProposerActions', () => {
    describe('round execution metrics', () => {
      it('records a metric when a slashing round is executed', async () => {
        rollup.getSlashEvents.mockResolvedValue([]);

        await slasherClient.handleRoundExecuted(7n, 2n, '0x1');

        const metric = telemetryClient
          .getMeters()
          .flatMap(meter => meter.metrics)
          .find(metric => metric.name === Metrics.SLASHER_ROUND_EXECUTED_COUNT.name);
        expect(metric?.points.map(point => point.value)).toEqual([0, 1]);
      });
    });

    describe('vote-offenses', () => {
      it('should return vote-offenses action when offenses are available for the target round', async () => {
        // Round 5 votes on round 3 (offset of 2)
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const targetRound = 3n;

        // Add slot-based offenses for the target round (slots 576-767 are in round 3)
        await offensesStore.addOffense(
          createOffense({
            validator: committee[0],
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );
        await offensesStore.addOffense(
          createOffense({
            validator: committee[1],
            amount: slashingUnit * 3n,
            epochOrSlot: targetRound * BigInt(roundSize) + 10n,
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(1);
        const action = actions[0];
        expectActionVoteOffenses(action, currentRound, [1, 3]);
        assert(action.type === 'vote-offenses');
        expect(action!.committees.length).toEqual(roundSizeInEpochs);
        expect(action!.committees[0]).toHaveLength(settings.targetCommitteeSize);
      });

      it('should not vote for offenses outside the target round', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const wrongRound = 4n; // Round 5 should vote on round 3, not 4

        await offensesStore.addOffense(
          createOffense({
            epochOrSlot: wrongRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toEqual([]);
      });

      it('should handle early rounds where offset cannot be applied', async () => {
        const currentRound = 0n;
        const currentSlot = currentRound * BigInt(roundSize) + 50n;

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));

        expect(action).toBeUndefined();
      });

      it('should use empty committees when epoch cache returns undefined', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const targetRound = 3n;

        await addOffense({
          epochOrSlot: targetRound * BigInt(roundSize) + BigInt(epochDuration),
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        });

        mockEpochCache.getCommitteeForEpoch.mockResolvedValueOnce({
          committee: undefined,
          seed: 0n,
          epoch: EpochNumber(0),
          isEscapeHatchOpen: false,
        });

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));

        // Should have called getCommitteeForEpoch for each epoch in the target round
        // For round 3 with epochDuration=32 and roundSize=128: epochs [12, 13, 14, 15]
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(12));
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(13));
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(14));
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(EpochNumber(15));

        expect(action).toBeDefined();
        assert(action?.type === 'vote-offenses');

        // Should have empty addresses as placeholders
        expect(action.committees[0]).toHaveLength(settings.targetCommitteeSize);
        expect(action.committees[0][0].toString()).toEqual(EthAddress.ZERO.toString());
      });

      it('should not return any action when computed votes are zero', async () => {
        // Round 5 votes on round 3 (offset of 2)
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const targetRound = 3n;

        // Add slot-based offense for the target round
        await offensesStore.addOffense(
          createOffense({
            validator: committee[0],
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
            amount: 1n, // Too low to reach minimum slash unit
          }),
        );

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));
        expect(actions).toHaveLength(0);
      });

      it('should not return any action for zero-amount offenses', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const targetRound = 3n;

        await offensesStore.addOffense(
          createOffense({
            validator: committee[0],
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
            amount: 0n,
          }),
        );

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));
        expect(actions).toHaveLength(0);
      });
    });

    describe('execute-slash', () => {
      it('should return execute-slash action when round is ready to execute', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const executableRound = 2n; // After execution delay of 2: currentRound - delay - 1 = 5 - 2 - 1 = 2

        slashingProposer.getRound.mockResolvedValueOnce(executableRoundData);

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(1);
        expectActionExecuteSlash(actions[0], executableRound);
        expect(slashingProposer.getRound).toHaveBeenCalledWith(executableRound);
      });

      it('should not execute rounds that have already been executed', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        slashingProposer.getRound.mockResolvedValueOnce(executedRoundData);

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toEqual([]);
      });

      it('should not execute rounds with not enough votes', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        slashingProposer.getRound.mockResolvedValueOnce({ ...executableRoundData, voteCount: 10n });

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toEqual([]);
      });

      it('should not execute rounds with no slash actions', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        slashingProposer.getRound.mockResolvedValueOnce(executableRoundData);

        slashingProposer.getTally.mockResolvedValueOnce({ actions: [], committees: [committee] });

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toEqual([]);
      });

      it('should not execute vetoed rounds', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);
        const executableRound = 2n; // After execution delay of 2: currentRound - delay - 1 = 5 - 2 - 1 = 2

        slashingProposer.getRound.mockResolvedValueOnce(executableRoundData);

        const payloadAddress = EthAddress.random();
        slashingProposer.getPayload.mockResolvedValue({
          address: payloadAddress,
          actions: [{ validator: committee[0], slashAmount: slashingUnit }],
        });

        slasherContract.isPayloadVetoed.mockResolvedValueOnce(true);
        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(0);
        expect(slashingProposer.getRound).toHaveBeenCalledWith(executableRound);
        expect(slasherContract.isPayloadVetoed).toHaveBeenCalledWith(payloadAddress);
      });

      it('should not execute when slashing is disabled', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        slasherContract.isSlashingEnabled.mockResolvedValue(false);
        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(0);
      });

      it('should return earliest execute when multiple are available', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        slasherClient.updateConfig({ slashExecuteRoundsLookBack: 5 });

        slashingProposer.getRound
          .mockResolvedValueOnce({ ...executedRoundData }) // round 0
          .mockResolvedValueOnce({ ...executableRoundData }); // round 1

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(1);
        expectActionExecuteSlash(actions[0], 1n);
        expect(slashingProposer.getRound).toHaveBeenCalledTimes(2);
        expect(slashingProposer.getRound).toHaveBeenCalledWith(0n);
        expect(slashingProposer.getRound).toHaveBeenCalledWith(1n);
      });

      it('should respect lifetimeInRounds when computing oldestExecutableRound', async () => {
        // Use a large lookBack to test that lifetimeInRounds constrains it
        slasherClient.updateConfig({ slashExecuteRoundsLookBack: 20 });

        const currentRound = 15n;
        const currentSlot = currentRound * BigInt(roundSize);
        const slashingLifetimeInRounds = BigInt(settings.slashingLifetimeInRounds); // 10

        // The oldest executable round should be currentRound - lifetimeInRounds = 15 - 10 = 5
        // NOT currentRound - executionDelay - 1 - lookBack = 15 - 2 - 1 - 20 = -8 (clamped to 0)
        const expectedOldestRound = currentRound - slashingLifetimeInRounds; // 5

        // Mock rounds 5-12 as executable (executableRound = currentRound - executionDelay - 1 = 15 - 2 - 1 = 12)
        slashingProposer.getRound.mockImplementation((round: bigint) =>
          Promise.resolve(round >= expectedOldestRound && round <= 12n ? executableRoundData : emptyRoundData),
        );

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        // Should execute the oldest round (5), not try to execute rounds before that
        expect(actions).toHaveLength(1);
        expectActionExecuteSlash(actions[0], expectedOldestRound);

        // Verify we didn't try to check rounds older than the lifetime allows
        expect(slashingProposer.getRound).not.toHaveBeenCalledWith(expectedOldestRound - 1n);
      });
    });

    describe('multiple', () => {
      it('should return empty actions', async () => {
        const currentRound = 5n;
        const slotNumber = currentRound * BigInt(roundSize);
        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(slotNumber));

        expect(actions).toEqual([]);
      });

      it('should return both vote and execute actions', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const targetRound = 3n;
        const executableRound = 2n; // currentRound - delay - 1 = 5 - 2 - 1 = 2

        // Add offense for voting
        await offensesStore.addOffense(
          createOffense({
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        // Mock executable round
        slashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          voteCount: 120n,
        });

        const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

        expect(actions).toHaveLength(2);
        expectActionExecuteSlash(actions[0], executableRound);
        expectActionVoteOffenses(actions[1], currentRound, [1]);
      });
    });
  });

  describe('gatherOffensesForRound', () => {
    it('should apply round offset when gathering offenses', async () => {
      const currentRound = 5n;
      const targetRound = 3n; // currentRound - offset(2)

      // Add slot-based offenses for different rounds
      const targetOffense = await addOffense({
        epochOrSlot: targetRound * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addOffense({
        epochOrSlot: (targetRound + 1n) * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based (wrong round)
      });
      await addOffense({
        epochOrSlot: (targetRound - 1n) * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based (wrong round)
      });

      const offenses = await slasherClient.gatherOffensesForRound(currentRound);

      expect(offenses).toHaveLength(1);
      expect(offenses[0]).toMatchObject(targetOffense);
    });

    it('should return empty array when round is less than offset', async () => {
      const currentRound = 1n; // Less than offset of 2

      await addOffense({ epochOrSlot: 100n });

      const offenses = await slasherClient.gatherOffensesForRound(currentRound);

      expect(offenses).toEqual([]);
    });

    it('should use current round when no round is specified', async () => {
      // Create offense for the expected target round (current slot will determine round)
      const currentRound = 5n;
      const currentSlot = currentRound * BigInt(roundSize); // Round 5
      const targetRound = currentRound - 2n; // 5 - 2 = 3
      await addOffense({
        epochOrSlot: targetRound * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });

      // Use getProposerActions to indirectly test the no-round-specified case
      const actions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(currentSlot));

      // Should have a vote action with the offense we added
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('vote-offenses');
    });

    it('should return all offenses for the round regardless of slashMaxPayloadSize', async () => {
      const currentRound = 5n;
      const targetRound = 3n; // currentRound - offset(2)
      const baseSlot = targetRound * BigInt(roundSize);

      // slashMaxPayloadSize has no effect on gatherOffensesForRound; truncation happens later
      // in getSlashConsensusVotesFromOffenses after always-slash offenses are merged in.
      slasherClient.updateConfig({ slashMaxPayloadSize: 2 });

      await addOffense({
        validator: committee[0],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[0],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });
      await addOffense({
        validator: committee[1],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[2],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });
      await addOffense({
        validator: committee[2],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[1],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });

      const offenses = await slasherClient.gatherOffensesForRound(currentRound);

      expect(offenses).toHaveLength(3);
    });

    it('should return all offenses for the round', async () => {
      const currentRound = 5n;
      const targetRound = 3n;
      const baseSlot = targetRound * BigInt(roundSize);

      await addOffense({
        validator: committee[0],
        epochOrSlot: baseSlot,
        amount: slashingUnit,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });
      await addOffense({
        validator: committee[1],
        epochOrSlot: baseSlot,
        amount: slashingUnit * 2n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });

      const offenses = await slasherClient.gatherOffensesForRound(currentRound);
      expect(offenses).toHaveLength(2);
    });

    it('should produce a valid vote action respecting slashMaxPayloadSize', async () => {
      const currentRound = 5n;
      const targetRound = 3n;
      const baseSlot = targetRound * BigInt(roundSize);

      // Cap at 1 slashed validator-epoch pair; the highest-amount validator should survive
      slasherClient.updateConfig({ slashMaxPayloadSize: 1 });

      await addOffense({
        validator: committee[0],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[0],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });
      await addOffense({
        validator: committee[1],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[2],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });
      await addOffense({
        validator: committee[2],
        epochOrSlot: baseSlot,
        amount: settings.slashingAmounts[1],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      });

      const currentSlot = currentRound * BigInt(roundSize);
      const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));

      expect(action).toBeDefined();
      assert(action!.type === 'vote-offenses');
      // Only committee[1] (3 units, highest) survives; the others are zeroed out
      expect(action!.votes[0]).toBe(0); // committee[0]: 1 unit, dropped
      expect(action!.votes[1]).toBe(3); // committee[1]: 3 units, kept
      expect(action!.votes[2]).toBe(0); // committee[2]: 2 units, dropped
    });
  });

  describe('handleWantToSlash', () => {
    it('should store offenses as pending', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      };

      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense);
    });

    it('should skip duplicate offenses', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      };

      await slasherClient.handleWantToSlash([offense]);
      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
    });

    it('should skip offenses during grace period', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 5n, // Within grace period of 10 slots
      };

      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getOffenses();
      expect(pendingOffenses).toHaveLength(0);
    });

    it('should allow offenses after grace period', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 20n, // After grace period of 10 slots
      };

      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
    });

    it('should handle multiple offenses from same validator', async () => {
      const validator = EthAddress.random();
      const offense1: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      };
      const offense2: WantToSlashArgs = {
        validator,
        amount: BigInt(roundSize),
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: 101n,
      };

      await slasherClient.handleWantToSlash([offense1, offense2]);

      const pendingOffenses = await offensesStore.getOffenses();
      expect(pendingOffenses).toHaveLength(2);
    });
  });

  describe('handleNewRound', () => {
    it('should call clearExpiredOffenses when entering new round', async () => {
      const currentRound = 15n;

      const clearSpy = jest.spyOn(offensesStore, 'clearExpiredOffenses');
      await slasherClient.handleNewRound(currentRound);
      expect(clearSpy).toHaveBeenCalledWith(currentRound);
    });
  });

  describe('updateConfig and getConfig', () => {
    it('should update configuration', () => {
      const newConfig = { slashGracePeriodL2Slots: 20 };
      slasherClient.updateConfig(newConfig);

      const updatedConfig = slasherClient.getConfig();
      expect(updatedConfig.slashGracePeriodL2Slots).toBe(20);
    });

    it('should preserve other config values when updating', () => {
      const originalConfig = slasherClient.getConfig();
      const newConfig = { slashGracePeriodL2Slots: 20 };

      slasherClient.updateConfig(newConfig);

      const updatedConfig = slasherClient.getConfig();
      expect(updatedConfig.slashMaxPayloadSize).toBe(originalConfig.slashMaxPayloadSize);
      expect(updatedConfig.slashGracePeriodL2Slots).toBe(20);
    });
  });

  describe('integration', () => {
    const waitForOffenses = (count: number) =>
      retryFastUntil(async () => {
        const pendingOffenses = await offensesStore.getOffenses();
        return pendingOffenses.length >= count ? true : undefined;
      }, 'offense to be processed');

    it('should handle from offense detection to execution', async () => {
      // Round 3: Offense occurs
      const offenseRound = 3n;
      const validator = committee[0];
      const offense: WantToSlashArgs = {
        validator,
        amount: settings.slashingAmounts[1],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        epochOrSlot: offenseRound * BigInt(roundSize),
      };

      // Start client to listen for watcher events
      await slasherClient.start();

      // Simulate watcher detecting offense
      dummyWatcher.triggerSlash([offense]);

      // Wait for the offense to be processed
      await waitForOffenses(1);

      // Round 5: Proposers vote on round 3 offenses
      const votingSlot = 5n * BigInt(roundSize);
      const voteActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(votingSlot));

      expect(voteActions).toHaveLength(1);
      expectActionVoteOffenses(voteActions[0], 5n, []);

      // Round 7: Can execute round 4 (after delay of 2: 7 - 2 - 1 = 4)
      const executionRound = 7n;
      const executionSlot = executionRound * BigInt(roundSize);
      const executableRound = executionRound - BigInt(settings.slashingExecutionDelayInRounds) - 1n; // 7 - 2 - 1 = 4
      slashingProposer.getRound.mockResolvedValueOnce(executableRoundData);

      const executeActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(executionSlot));

      expect(executeActions).toHaveLength(1);
      expectActionExecuteSlash(executeActions[0], executableRound);

      // Verify that if round is marked as executed it won't be executed again
      slashingProposer.getRound.mockResolvedValueOnce(executedRoundData);

      const postExecuteActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(executionSlot));
      expect(postExecuteActions).toEqual([]);
    });

    it('should handle missed execution', async () => {
      slasherClient.updateConfig({ slashExecuteRoundsLookBack: 3 });
      await slasherClient.start();

      // Round 3: An offense occurs
      const offenseRound = 3n;
      const validator = committee[0];
      const offense: WantToSlashArgs = {
        validator,
        amount: settings.slashingAmounts[1],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        epochOrSlot: offenseRound * BigInt(roundSize),
      };
      dummyWatcher.triggerSlash([offense]);

      // Wait for the first offense to be processed
      await waitForOffenses(1);

      // Round 4: Another offense!
      const offenseRound4 = 4n;
      const offense4: WantToSlashArgs = {
        validator,
        amount: settings.slashingAmounts[1],
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        epochOrSlot: offenseRound4 * BigInt(roundSize),
      };
      dummyWatcher.triggerSlash([offense4]);

      // Wait for the second offense to be processed
      await waitForOffenses(2);

      // Round 5: Proposers vote on round 3 offenses
      const votingSlot = 5n * BigInt(roundSize);
      const voteActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(votingSlot));
      expect(voteActions).toHaveLength(1);
      expectActionVoteOffenses(voteActions[0], 5n, []);

      // Round 6: Proposers vote on round 4 offenses
      const votingSlot6 = 6n * BigInt(roundSize);
      const voteActions6 = await slasherClient.getProposerActions(SlotNumber.fromBigInt(votingSlot6));
      expect(voteActions6).toHaveLength(1);
      expectActionVoteOffenses(voteActions6[0], 6n, []);

      // Assume everything after round 4 inclusive is executable
      slashingProposer.getRound.mockImplementation((round: bigint) =>
        Promise.resolve(round >= 4n ? executableRoundData : emptyRoundData),
      );

      // Round 7: Can execute round 4
      const executionRound = 7n;
      const executionSlot = executionRound * BigInt(roundSize);
      const executableRound = executionRound - BigInt(settings.slashingExecutionDelayInRounds) - 1n; // 7 - 2 - 1 = 4
      expect(executableRound).toBe(4n);
      const executeActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(executionSlot));
      expect(executeActions).toHaveLength(1);
      expectActionExecuteSlash(executeActions[0], executableRound);

      // Round 8.0: Assuming no execution on round 7, we should get another chance to execute round 4
      const nextExecutionRound = 8n;
      const nextExecutionSlot = nextExecutionRound * BigInt(roundSize);
      const nextExecuteActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(nextExecutionSlot));
      expect(nextExecuteActions).toHaveLength(1);
      expectActionExecuteSlash(nextExecuteActions[0], executableRound);

      // Round 8.1: But if there was execution, then we move onto executing round 5
      slashingProposer.getRound.mockImplementation((round: bigint) =>
        Promise.resolve(round >= 5n ? executableRoundData : emptyRoundData),
      );
      const executeActionsRound5 = await slasherClient.getProposerActions(
        SlotNumber.fromBigInt(nextExecutionSlot + 1n),
      );
      expect(executeActionsRound5).toHaveLength(1);
      expectActionExecuteSlash(executeActionsRound5[0], 5n);

      // Round 8.2: And if round 5 is executed as well, then nothing left to do
      slashingProposer.getRound.mockResolvedValue(executedRoundData);
      const noExecuteActions = await slasherClient.getProposerActions(SlotNumber.fromBigInt(nextExecutionSlot + 1n));
      expect(noExecuteActions).toHaveLength(0);
    });

    it('should handle multiple offenses with different slash amounts', async () => {
      const currentRound = 5n;
      const currentSlot = currentRound * BigInt(roundSize); // Round 5
      const targetRound = 3n;

      // Add offenses with different amounts
      await addOffense({
        validator: committee[0],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: settings.slashingAmounts[0], // 1 unit
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addOffense({
        validator: committee[1],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: settings.slashingAmounts[0], // 1 units
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addOffense({
        validator: committee[1], // same as above!
        epochOrSlot: targetRound * BigInt(roundSize) + 1n,
        amount: 2n * settings.slashingAmounts[0], // 2 units on top of the previous 1
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addOffense({
        validator: committee[2],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: 20n * settings.slashingAmounts[0], // Exceeds max 3 units
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });

      const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
      expectActionVoteOffenses(action!, currentRound, [1, 3, 3]);
    });
  });

  describe('validator override lists', () => {
    describe('slashValidatorsAlways', () => {
      it('should slash validators on the always list with maximum slash units', async () => {
        const alwaysSlashValidator = committee[0];
        const normalValidator = committee[1];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [alwaysSlashValidator],
          slashValidatorsNever: [],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        // Add offense for normal validator (should be processed normally)
        await addOffense({
          validator: normalValidator,
          epochOrSlot: (currentRound - 2n) * BigInt(roundSize),
          amount: slashingUnit, // 1 unit
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        });

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [3, 1]); // Always validator gets 3 units, normal gets 1
      });

      it('should handle multiple validators in always list', async () => {
        const alwaysSlashValidator1 = committee[0];
        const alwaysSlashValidator2 = committee[1];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [alwaysSlashValidator1, alwaysSlashValidator2],
          slashValidatorsNever: [],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [3, 3, 0]); // Both always validators get 3 units, normal gets 0
      });
    });

    describe('slashValidatorsNever', () => {
      it('should never slash validators on the never list', async () => {
        const neverSlashValidator = committee[0];
        const normalValidator = committee[1];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [],
          slashValidatorsNever: [neverSlashValidator],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        // Add offenses for both validators
        await addOffense({
          validator: neverSlashValidator,
          epochOrSlot: (currentRound - 2n) * BigInt(roundSize),
          amount: slashingUnit * 10n, // Large amount that would normally result in 3 units
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        });

        await addOffense({
          validator: normalValidator,
          epochOrSlot: (currentRound - 2n) * BigInt(roundSize),
          amount: slashingUnit, // 1 unit
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        });

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [0, 1]); // Never validator gets 0 units, normal gets 1
      });

      it('should handle multiple validators in never list', async () => {
        const neverSlashValidator1 = committee[0];
        const neverSlashValidator2 = committee[1];
        const normalValidator = committee[2];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [],
          slashValidatorsNever: [neverSlashValidator1, neverSlashValidator2],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        // Add offenses for all validators
        for (const validator of [neverSlashValidator1, neverSlashValidator2, normalValidator]) {
          await addOffense({
            validator,
            epochOrSlot: (currentRound - 2n) * BigInt(roundSize),
            amount: slashingUnit * 2n, // 2 units
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
          });
        }

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [0, 0, 2]); // Never validators get 0, normal gets 2
      });
    });

    describe('combined always and never lists', () => {
      it('should prioritize never list over always list', async () => {
        const conflictValidator = committee[0]; // This validator is in both lists
        const alwaysValidator = committee[1];
        const neverValidator = committee[2];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [conflictValidator, alwaysValidator],
          slashValidatorsNever: [conflictValidator, neverValidator],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [0, 3, 0]); // Conflict gets 0 (never wins), always gets 3, never gets 0
      });
    });

    describe('mixed validators in lists', () => {
      it('should handle mixed validators correctly', async () => {
        const alwaysValidator = committee[0];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [alwaysValidator],
          slashValidatorsNever: [],
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [3]); // Always validator should get max slash units
      });
    });

    describe('empty lists', () => {
      it('should handle empty always and never lists', async () => {
        const normalValidator = committee[0];

        // Update the existing client's config
        slasherClient.updateConfig({
          slashValidatorsAlways: [],
          slashValidatorsNever: [], // Empty array
        });

        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize);

        // Add offense for normal processing
        await addOffense({
          validator: normalValidator,
          epochOrSlot: (currentRound - 2n) * BigInt(roundSize),
          amount: slashingUnit, // 1 unit
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        });

        const action = await slasherClient.getVoteOffensesAction(SlotNumber.fromBigInt(currentSlot));
        expectActionVoteOffenses(action!, currentRound, [1]); // Normal processing should work
      });
    });
  });
});

// Test helper class that exposes protected methods for testing
class TestSlasherClient extends SlasherClient {
  public override handleRoundExecuted(round: bigint, slashCount: bigint, l1BlockHash: Hex): Promise<void> {
    return super.handleRoundExecuted(round, slashCount, l1BlockHash);
  }

  public override handleNewRound(round: bigint): Promise<void> {
    return super.handleNewRound(round);
  }

  public override getExecuteSlashAction(slotNumber: SlotNumber): Promise<ProposerSlashAction | undefined> {
    return super.getExecuteSlashAction(slotNumber);
  }

  public override getVoteOffensesAction(slotNumber: SlotNumber): Promise<ProposerSlashAction | undefined> {
    return super.getVoteOffensesAction(slotNumber);
  }

  public handleWantToSlash(args: WantToSlashArgs[]) {
    return this.offensesCollector.handleWantToSlash(args);
  }
}
