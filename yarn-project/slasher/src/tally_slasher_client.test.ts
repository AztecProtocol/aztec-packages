import { sleep } from '@aztec/aztec.js';
import type { EpochCache } from '@aztec/epoch-cache';
import { RollupContract, TallySlashingProposerContract } from '@aztec/ethereum/contracts';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type Offense, OffenseType, type ProposerSlashAction } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mockDeep } from 'jest-mock-extended';
import assert from 'node:assert';
import EventEmitter from 'node:events';

import { DefaultSlasherConfig } from './config.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import { TallySlasherClient, type TallySlasherSettings } from './tally_slasher_client.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from './watcher.js';

describe('TallySlasherClient', () => {
  let tallySlasherClient: TestTallySlasherClient;
  let tallySlashingProposer: MockProxy<TallySlashingProposerContract>;
  let rollup: MockProxy<RollupContract>;
  let dummyWatcher: DummyWatcher;
  let kvStore: ReturnType<typeof openTmpStore>;
  let offensesStore: SlasherOffensesStore;
  let dateProvider: DateProvider;
  let logger: Logger;
  let mockEpochCache: MockProxy<EpochCache>;

  let committee: EthAddress[];

  const slashingUnit = 1000000000000000000n; // 1 ETH in wei
  const roundSizeInEpochs = 4;
  const epochDuration = 32;
  const roundSize = roundSizeInEpochs * epochDuration;
  const settings: TallySlasherSettings = {
    slashingExecutionDelayInRounds: 2,
    slashingRoundSize: roundSize,
    slashingRoundSizeInEpochs: roundSizeInEpochs,
    epochDuration: epochDuration,
    slashingLifetimeInRounds: 10,
    slashingOffsetInRounds: 2,
    slashingUnit,
    targetCommitteeSize: 100,
    l1GenesisTime: BigInt(Math.floor(Date.now() / 1000) - 10000),
    slotDuration: 4,
    slashingQuorumSize: 110,
  };

  const config: SlasherConfig = {
    ...DefaultSlasherConfig,
    slashGracePeriodL2Slots: 10,
    slashMaxPayloadSize: 100,
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

  const addPendingOffense = async (opts: Parameters<typeof createOffense>[0] = {}): Promise<Offense> => {
    const offense = createOffense(opts);
    await offensesStore.addPendingOffense(offense);
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

  class DummyWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
    public start() {
      return Promise.resolve();
    }

    public stop() {
      return Promise.resolve();
    }

    public triggerSlash(args: WantToSlashArgs[]) {
      this.emit(WANT_TO_SLASH_EVENT, args);
    }
  }

  beforeEach(() => {
    kvStore = openTmpStore(true);
    offensesStore = new SlasherOffensesStore(kvStore, settings);
    dummyWatcher = new DummyWatcher();
    dateProvider = new DateProvider();
    logger = createLogger('test');
    committee = times(settings.targetCommitteeSize, i => EthAddress.fromNumber(i + 1));

    // Create mock EpochCache
    mockEpochCache = mockDeep<EpochCache>();
    mockEpochCache.getCommitteeForEpoch.mockImplementation((epoch: bigint) =>
      Promise.resolve({ committee, seed: 0n, epoch }),
    );
    mockEpochCache.getL1Constants.mockReturnValue({
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      slotDuration: 4,
      epochDuration: 32,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 8,
    });

    // Create mocks for L1 contracts
    tallySlashingProposer = mockDeep<TallySlashingProposerContract>();
    rollup = mockDeep<RollupContract>();

    // Setup mock responses
    tallySlashingProposer.getRound.mockResolvedValue({ isExecuted: false, readyToExecute: false, voteCount: 0n });
    tallySlashingProposer.getTally.mockResolvedValue([{ validator: committee[0], slashAmount: slashingUnit }]);

    // Mock event listeners to return unwatch functions
    tallySlashingProposer.listenToVoteCast.mockReturnValue(() => {});
    tallySlashingProposer.listenToRoundExecuted.mockReturnValue(() => {});

    // Create consensus slasher client with proper constructor parameters
    tallySlasherClient = new TestTallySlasherClient(
      config,
      settings,
      tallySlashingProposer,
      rollup,
      [dummyWatcher],
      mockEpochCache,
      dateProvider,
      offensesStore,
      logger,
    );
  });

  afterEach(async () => {
    await tallySlasherClient.stop();
    await kvStore.close();
  });

  describe('getProposerActions', () => {
    describe('vote-offenses', () => {
      it('should return vote-offenses action when offenses are available for the target round', async () => {
        // Round 5 votes on round 3 (offset of 2)
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const targetRound = 3n;

        // Add slot-based offenses for the target round (slots 576-767 are in round 3)
        await offensesStore.addPendingOffense(
          createOffense({
            validator: committee[0],
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );
        await offensesStore.addPendingOffense(
          createOffense({
            validator: committee[1],
            amount: slashingUnit * 3n,
            epochOrSlot: targetRound * BigInt(roundSize) + 10n,
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toHaveLength(1);
        const action = actions[0];
        expectActionVoteOffenses(action, currentRound, [1, 3]);
        assert(action.type === 'vote-offenses');
        expect(action!.committees.length).toEqual(roundSizeInEpochs);
        expect(action!.committees[0]).toHaveLength(settings.targetCommitteeSize);
      });

      it('should not vote for offenses outside the target round', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const wrongRound = 4n; // Round 5 should vote on round 3, not 4

        await offensesStore.addPendingOffense(
          createOffense({
            epochOrSlot: wrongRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toEqual([]);
      });

      it('should handle early rounds where offset cannot be applied', async () => {
        const currentRound = 0n;
        const currentSlot = currentRound * BigInt(roundSize) + 50n; // Round 0 (any slot in round 0)

        const action = await tallySlasherClient.getVoteOffensesAction(currentSlot);

        expect(action).toBeUndefined();
      });

      it('should use empty committees when epoch cache returns undefined', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const targetRound = 3n;

        await addPendingOffense({
          epochOrSlot: targetRound * BigInt(roundSize),
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        });

        mockEpochCache.getCommitteeForEpoch.mockResolvedValueOnce({
          committee: undefined,
          seed: 0n,
          epoch: 0n,
        });

        const action = await tallySlasherClient.getVoteOffensesAction(currentSlot);

        // Should have called getCommitteeForEpoch for each epoch in the target round
        // For round 3 with epochDuration=32 and roundSize=128: epochs [12, 13, 14, 15]
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(12n);
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(13n);
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(14n);
        expect(mockEpochCache.getCommitteeForEpoch).toHaveBeenCalledWith(15n);

        expect(action).toBeDefined();
        assert(action?.type === 'vote-offenses');

        // Should have empty addresses as placeholders
        expect(action.committees[0]).toHaveLength(settings.targetCommitteeSize);
        expect(action.committees[0][0].toString()).toEqual(EthAddress.ZERO.toString());
      });
    });

    describe('execute-slash', () => {
      it('should return execute-slash action when round is ready to execute', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const executableRound = 2n; // After execution delay of 2: currentRound - delay - 1 = 5 - 2 - 1 = 2

        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          readyToExecute: true,
          voteCount: 120n,
        });

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toHaveLength(1);
        expectActionExecuteSlash(actions[0], executableRound);
        expect(tallySlashingProposer.getRound).toHaveBeenCalledWith(executableRound);
      });

      it('should not execute rounds that have already been executed', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5

        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: true,
          readyToExecute: true,
          voteCount: 120n,
        });

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toEqual([]);
      });

      it('should not execute rounds not ready to execute', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5

        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          readyToExecute: false,
          voteCount: 120n,
        });

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toEqual([]);
      });

      it('should not execute rounds with not enough votes', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5

        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          readyToExecute: true,
          voteCount: 10n,
        });

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toEqual([]);
      });

      it('should not execute rounds with no slash actions', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5

        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          readyToExecute: true,
          voteCount: 120n,
        });

        tallySlashingProposer.getTally.mockResolvedValueOnce([]);

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

        expect(actions).toEqual([]);
      });
    });

    describe('multiple', () => {
      it('should return empty actions', async () => {
        const currentRound = 5n;
        const slotNumber = currentRound * BigInt(roundSize);
        const actions = await tallySlasherClient.getProposerActions(slotNumber);

        expect(actions).toEqual([]);
      });

      it('should return both vote and execute actions', async () => {
        const currentRound = 5n;
        const currentSlot = currentRound * BigInt(roundSize); // Round 5
        const targetRound = 3n;
        const executableRound = 2n; // currentRound - delay - 1 = 5 - 2 - 1 = 2

        // Add offense for voting
        await offensesStore.addPendingOffense(
          createOffense({
            epochOrSlot: targetRound * BigInt(roundSize),
            offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          }),
        );

        // Mock executable round
        tallySlashingProposer.getRound.mockResolvedValueOnce({
          isExecuted: false,
          readyToExecute: true,
          voteCount: 120n,
        });

        const actions = await tallySlasherClient.getProposerActions(currentSlot);

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
      const targetOffense = await addPendingOffense({
        epochOrSlot: targetRound * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addPendingOffense({
        epochOrSlot: (targetRound + 1n) * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based (wrong round)
      });
      await addPendingOffense({
        epochOrSlot: (targetRound - 1n) * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based (wrong round)
      });

      const offenses = await tallySlasherClient.gatherOffensesForRound(currentRound);

      expect(offenses).toHaveLength(1);
      expect(offenses[0]).toMatchObject(targetOffense);
    });

    it('should return empty array when round is less than offset', async () => {
      const currentRound = 1n; // Less than offset of 2

      await addPendingOffense({ epochOrSlot: 100n });

      const offenses = await tallySlasherClient.gatherOffensesForRound(currentRound);

      expect(offenses).toEqual([]);
    });

    it('should use current round when no round is specified', async () => {
      // Create offense for the expected target round (current slot will determine round)
      const currentRound = 5n;
      const currentSlot = currentRound * BigInt(roundSize); // Round 5
      const targetRound = currentRound - 2n; // 5 - 2 = 3
      await addPendingOffense({
        epochOrSlot: targetRound * BigInt(roundSize),
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });

      // Use getProposerActions to indirectly test the no-round-specified case
      const actions = await tallySlasherClient.getProposerActions(currentSlot);

      // Should have a vote action with the offense we added
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('vote-offenses');
    });
  });

  describe('getSlashPayloads', () => {
    it('should throw error as consensus client does not support slash payloads', async () => {
      await expect(tallySlasherClient.getSlashPayloads()).rejects.toThrow(/not support/);
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

      await tallySlasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
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

      await tallySlasherClient.handleWantToSlash([offense]);
      await tallySlasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
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

      await tallySlasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
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

      await tallySlasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
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

      await tallySlasherClient.handleWantToSlash([offense1, offense2]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(2);
    });
  });

  describe('handleNewRound', () => {
    it('should call clearExpiredOffenses when entering new round', async () => {
      const currentRound = 15n;

      const clearSpy = jest.spyOn(offensesStore, 'clearExpiredOffenses');
      await tallySlasherClient.handleNewRound(currentRound);
      expect(clearSpy).toHaveBeenCalledWith(currentRound);
    });
  });

  describe('updateConfig and getConfig', () => {
    it('should update configuration', () => {
      const newConfig = { slashGracePeriodL2Slots: 20 };
      tallySlasherClient.updateConfig(newConfig);

      const updatedConfig = tallySlasherClient.getConfig();
      expect(updatedConfig.slashGracePeriodL2Slots).toBe(20);
    });

    it('should preserve other config values when updating', () => {
      const originalConfig = tallySlasherClient.getConfig();
      const newConfig = { slashGracePeriodL2Slots: 20 };

      tallySlasherClient.updateConfig(newConfig);

      const updatedConfig = tallySlasherClient.getConfig();
      expect(updatedConfig.slashMaxPayloadSize).toBe(originalConfig.slashMaxPayloadSize);
      expect(updatedConfig.slashGracePeriodL2Slots).toBe(20);
    });
  });

  describe('integration', () => {
    it('should handle from offense detection to execution', async () => {
      // Round 3: Offense occurs
      const offenseRound = 3n;
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 2n * settings.slashingUnit,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
        epochOrSlot: offenseRound * BigInt(roundSize),
      };

      // Start client to listen for watcher events
      await tallySlasherClient.start();

      // Simulate watcher detecting offense
      dummyWatcher.triggerSlash([offense]);
      await sleep(100);

      // Round 5: Proposers vote on round 3 offenses
      const votingSlot = 5n * BigInt(roundSize);
      const voteActions = await tallySlasherClient.getProposerActions(votingSlot);

      expect(voteActions).toHaveLength(1);
      expectActionVoteOffenses(voteActions[0], 5n, []);

      // Round 7: Can execute round 4 (after delay of 2: 7 - 2 - 1 = 4)
      const executionRound = 7n;
      const executionSlot = executionRound * BigInt(roundSize);
      const executableRound = executionRound - BigInt(settings.slashingExecutionDelayInRounds) - 1n; // 7 - 2 - 1 = 4
      tallySlashingProposer.getRound.mockResolvedValueOnce({
        isExecuted: false,
        readyToExecute: true,
        voteCount: 150n,
      });

      const executeActions = await tallySlasherClient.getProposerActions(executionSlot);

      expect(executeActions).toHaveLength(1);
      expectActionExecuteSlash(executeActions[0], executableRound);

      // Verify that if round is marked as executed it won't be executed again
      tallySlashingProposer.getRound.mockResolvedValueOnce({
        isExecuted: true,
        readyToExecute: true,
        voteCount: 150n,
      });

      const postExecuteActions = await tallySlasherClient.getProposerActions(executionSlot);
      expect(postExecuteActions).toEqual([]);
    });

    it('should handle multiple offenses with different slash amounts', async () => {
      const currentRound = 5n;
      const currentSlot = currentRound * BigInt(roundSize); // Round 5
      const targetRound = 3n;

      // Add offenses with different amounts
      await addPendingOffense({
        validator: committee[0],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: 1n * settings.slashingUnit, // 1 unit
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addPendingOffense({
        validator: committee[1],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: 5n * settings.slashingUnit, // 5 units
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addPendingOffense({
        validator: committee[1], // same as above!
        epochOrSlot: targetRound * BigInt(roundSize) + 1n,
        amount: 3n * settings.slashingUnit, // 3 units on top of the previous 5
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });
      await addPendingOffense({
        validator: committee[2],
        epochOrSlot: targetRound * BigInt(roundSize),
        amount: 20n * settings.slashingUnit, // Exceeds max 3 units
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
      });

      const action = await tallySlasherClient.getVoteOffensesAction(currentSlot);
      expectActionVoteOffenses(action!, currentRound, [1, 3, 3]);
    });
  });
});

// Test helper class that exposes protected methods for testing
class TestTallySlasherClient extends TallySlasherClient {
  public override handleNewRound(round: bigint): Promise<void> {
    return super.handleNewRound(round);
  }

  public override getExecuteSlashAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    return super.getExecuteSlashAction(slotNumber);
  }

  public override getVoteOffensesAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    return super.getVoteOffensesAction(slotNumber);
  }

  public handleWantToSlash(args: WantToSlashArgs[]) {
    return this.offensesCollector.handleWantToSlash(args);
  }

  public override async stop() {
    for (const unwatchCallback of this.unwatchCallbacks) {
      unwatchCallback();
    }

    this.roundMonitor.stop();
    await this.offensesCollector.stop();

    // Remove sleep if not running in CI for faster dev iteration
    // This is here just to avoid a viem issue when uninstalling event listeners
    if (process.env.CI) {
      await sleep(2000);
    }
  }
}
