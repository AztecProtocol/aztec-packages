import { SlashingProposerContract } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import {
  type Offense,
  OffenseType,
  type ProposerSlashAction,
  type SlashPayload,
  type SlashPayloadRound,
} from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mockDeep } from 'jest-mock-extended';
import assert from 'node:assert';
import EventEmitter from 'node:events';

import {
  DefaultSlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from './config.js';
import { SlasherClient, type SlasherSettings } from './slasher_client.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import { SlasherPayloadsStore } from './stores/payloads_store.js';

describe('SlasherClient', () => {
  let slasherClient: TestSlasherClient;
  let slashFactoryContract: MockProxy<SlashFactoryContract>;
  let slashingProposer: MockProxy<SlashingProposerContract>;
  let dummyWatcher: DummyWatcher;
  let kvStore: ReturnType<typeof openTmpStore>;
  let offensesStore: SlasherOffensesStore;
  let payloadsStore: SlasherPayloadsStore;
  let dateProvider: DateProvider;
  let logger: Logger;

  const rollupAddress = EthAddress.random();
  const settings: SlasherSettings = {
    slashingExecutionDelayInRounds: 2n,
    slashingPayloadLifetimeInRounds: 10n,
    slashingRoundSize: 200n,
    slashingQuorumSize: 120n,
    epochDuration: 32,
    proofSubmissionEpochs: 8,
    l1GenesisTime: BigInt(Math.floor(Date.now() / 1000) - 10000),
    l1StartBlock: 0n,
    slotDuration: 4,
    ethereumSlotDuration: 12,
  };

  const config: SlasherConfig = {
    ...DefaultSlasherConfig,
    slashGracePeriodL2Slots: 10,
    slashMaxPayloadSize: 100,
  };

  const makeSlashPayload = (
    opts: {
      amount?: bigint;
      address?: EthAddress;
      validator?: EthAddress;
      offenseType?: OffenseType;
      epochOrSlot?: bigint;
    } = {},
  ): SlashPayload => {
    const { amount = 100n, address, validator, offenseType = OffenseType.INACTIVITY, epochOrSlot = 1n } = opts;
    const payloadAddress = address ?? EthAddress.random();
    const validatorAddress = validator ?? EthAddress.random();

    const slashes =
      amount === 0n ? [] : [{ validator: validatorAddress, amount, offenses: [{ epochOrSlot, offenseType }] }];

    const payload: SlashPayload = {
      address: payloadAddress,
      slashes,
      timestamp: BigInt(Date.now()),
    };

    return payload;
  };

  const makeSlashPayloadRound = (
    opts: {
      amount?: bigint;
      votes?: bigint;
      round?: bigint;
      address?: EthAddress;
      validator?: EthAddress;
      offenseType?: OffenseType;
      epochOrSlot?: bigint;
    } = {},
  ): SlashPayloadRound => {
    const { votes = 1n, round = 1n } = opts;

    const slashPayload = makeSlashPayload(opts);
    return { ...slashPayload, votes, round };
  };

  const addSlashPayload = async (opts: Parameters<typeof makeSlashPayloadRound>[0]): Promise<SlashPayloadRound> => {
    const payload = makeSlashPayloadRound(opts);
    await payloadsStore.addPayload(payload);
    return payload;
  };

  const addPendingOffense = async (opts: {
    amount?: bigint;
    offenseType?: OffenseType;
    epochOrSlot?: bigint;
    validator?: EthAddress;
  }): Promise<Offense> => {
    const { amount = 100n, offenseType = OffenseType.UNKNOWN, epochOrSlot = 20n, validator } = opts;
    const validatorAddress = validator ?? EthAddress.random();

    const offense: Offense = {
      validator: validatorAddress,
      amount,
      offenseType: offenseType,
      epochOrSlot,
    };

    await offensesStore.addPendingOffense(offense);
    return offense;
  };

  const expectActionCreatePayload = (action: ProposerSlashAction, expectedOffense: Offense) => {
    expect(action.type).toBe('create-payload');
    assert(action.type === 'create-payload');
    expect(action.data).toHaveLength(1);
    expect(action.data[0].validator).toEqual(expectedOffense.validator);
    expect(action.data[0].amount).toEqual(expectedOffense.amount);
    expect(action.data[0].offenses[0].offenseType).toEqual(expectedOffense.offenseType);
  };

  const expectActionVotePayload = (action: ProposerSlashAction, expectedPayload: EthAddress) => {
    expect(action.type).toBe('vote-payload');
    assert(action.type === 'vote-payload');
    expect(action.payload).toEqual(expectedPayload);
  };

  beforeEach(() => {
    logger = createLogger('slasher:test');
    dateProvider = new DateProvider();

    // Create real stores with in-memory database
    kvStore = openTmpStore();
    offensesStore = new SlasherOffensesStore(kvStore, settings);
    payloadsStore = new SlasherPayloadsStore(kvStore);

    // Create mocks for L1 contracts
    slashFactoryContract = mockDeep<SlashFactoryContract>();
    slashingProposer = mockDeep<SlashingProposerContract>();

    // Create watcher
    dummyWatcher = new DummyWatcher();

    // Create slasher client
    slasherClient = new TestSlasherClient(
      config,
      settings,
      slashFactoryContract,
      slashingProposer,
      rollupAddress,
      [dummyWatcher],
      dateProvider,
      offensesStore,
      payloadsStore,
      logger,
    );
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('creates payloads when the watcher signals', async () => {
    const slashAmount = activationThreshold - 1n;
    expect(slashAmount).toBeLessThan(activationThreshold);
    const committee = await rollup.getCurrentEpochCommittee();
    if (!committee) {
      throw new Error('No committee found');
    }

    const amounts = Array.from({ length: committee.length }, () => slashAmount);
    const offenses = Array.from({ length: committee.length }, () => Offense.UNKNOWN);

    const args = committee.map((validator, index) => ({
      validator: EthAddress.fromString(validator),
      amount: amounts[index],
      offense: offenses[index],
    }));

    dummyWatcher.triggerSlash(args);

    // A monitored payload should be created automatically
    let payload: EthAddress | undefined = undefined;
    await retryUntil(
      async () => {
        const slot = await rollup.getSlotNumber();
        payload = await slasherClient.getSlashPayload(slot);
        return payload !== undefined && !payload.isZero();
      },
      'has monitored payload',
      5,
      0.5,
    );

    const quorumSize = await slashingProposer.getQuorumSize();
    logger.info('Quorum size:', quorumSize);
    const roundSize = await slashingProposer.getRoundSize();
    logger.info('Round size:', roundSize);

    // Await the slashing
    await retryUntil(
      async () => {
        // sometimes the custom error is not decoded properly

        const ignoreExpectedErrors = (err: Error) => {
          const permissibleErrors = [
            'GovernanceProposer__OnlyProposerCanVote',
            '0xea36d1ac',
            'ValidatorSelection__InsufficientValidatorSetSize',
            '0xf4f28e99',
          ];
          if (permissibleErrors.some(error => err.message.includes(error))) {
            return;
          }
          logger.error('Error:', err);
          throw err;
        };

        await rollup.setupEpoch(l1TxUtils).catch(ignoreExpectedErrors);

        const timestamp = await ethCheatCodes.timestamp();
        const slotNumAtNextL1Block = await rollup.getSlotAt(BigInt(timestamp + ethereumSlotDuration));
        logger.info('Slot number at next L1 block:', slotNumAtNextL1Block);

        // Print debug info
        const round = await slashingProposer.computeRound(slotNumAtNextL1Block);
        const roundInfo = await slashingProposer.getRoundInfo(rollup.address, round);
        const leaderVotes = await slashingProposer.getPayloadSignals(
          rollup.address,
          round,
          roundInfo.payloadWithMostSignals,
        );
        logger.info(`Currently in round ${round}`);
        logger.info('Round info:', roundInfo);
        logger.info(`Leader votes: ${leaderVotes}`);

        // Have the slasher sign the vote request
        const signalRequest = await slashingProposer.createSignalRequestWithSignature(
          payload!.toString(),
          slotNumAtNextL1Block,
          slasherL1Client.chain.id,
          slasherPrivateKey.address,
          msg => slasherPrivateKey.signTypedData(msg),
        );

        // Have the test harness send the vote request to avoid nonce conflicts
        await testHarnessL1Client.sendTransaction(signalRequest).catch(ignoreExpectedErrors);

        // Check if the payload is cleared
        const slot = await rollup.getSlotNumber();
        payload = await slasherClient.getSlashPayload(slot);
        return payload === undefined;
      },
      'cleared monitored payload',
      30,
      0.5,
    );

    const info = await rollup.getAttesterView(slasherL1Client.account.address);

    expect(info.effectiveBalance).toBe(0n);
    expect(info.exit.amount).toBe(activationThreshold - slashAmount);
  });

  it('drops payloads beyond TTL', async () => {
    const config = {
      slashPayloadTtlSeconds: 1,
    };
    slasherClient.updateConfig(config);
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: activationThreshold,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    await sleep(config.slashPayloadTtlSeconds * 1000 + 100);

    const slot = await rollup.getSlotNumber();
    const payload = await slasherClient.getSlashPayload(slot);

    expect(payload).toBeUndefined();
  });

  it('clears monitored payloads', async () => {
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: activationThreshold,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    slasherClient.clearMonitoredPayloads();
    expect(slasherClient.getMonitoredPayloads()).toEqual([]);
  });

  it('only signals for override payload if present', async () => {
    const config = {
      slashOverridePayload: EthAddress.random(),
    };
    slasherClient.updateConfig(config);

    const slot = BigInt(Math.floor(Math.random() * 1000000));
    const payload = await slasherClient.getSlashPayload(slot);
    expect(payload).toBe(config.slashOverridePayload);

    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.random(),
        amount: activationThreshold,
        offense: Offense.UNKNOWN,
      },
    ]);

    await awaitMonitoredPayloads(slasherClient);

    const slot2 = BigInt(Math.floor(Math.random() * 1000000));
    const payload2 = await slasherClient.getSlashPayload(slot2);
    expect(payload2).toBe(config.slashOverridePayload);

    slasherClient.payloadSubmitted({ round: 0n, payload: config.slashOverridePayload.toString() });

    const slot3 = BigInt(Math.floor(Math.random() * 1000000));
    const payload3 = await slasherClient.getSlashPayload(slot3);
    // now we get the payload that was triggered by the watcher
    expect(payload3).not.toBe(config.slashOverridePayload);

    // but if we update the config we get the override payload again
    slasherClient.updateConfig(config);
    const payload4 = await slasherClient.getSlashPayload(slot3);
    expect(payload4).toBe(config.slashOverridePayload);
  });

  it('sorts offenses within payload by validator address', async () => {
    dummyWatcher.triggerSlash([
      {
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000003'),
        amount: 100n,
        offenseType: OffenseType.UNKNOWN,
        epochOrSlot: 1n,
      };

      await slasherClient.handleWantToSlash([offense]);
      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
    });

    it('skips duplicate offenses with different amounts', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.UNKNOWN,
        epochOrSlot: 1n,
      };

      await slasherClient.handleWantToSlash([offense]);
      await slasherClient.handleWantToSlash([{ ...offense, amount: 200n }]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense); // First one wins
    });

    it('skips offenses during grace period', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS, // Use a slot-based offense
        epochOrSlot: 1n, // Slot 1 is within grace period of 10 slots
      };

      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(0);
    });

    it('allows offenses after grace period', async () => {
      const validator = EthAddress.random();
      const offense: WantToSlashArgs = {
        validator,
        amount: 100n,
        offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS, // Use a slot-based offense
        epochOrSlot: 20n, // After grace period of 10 slots
      };

      await slasherClient.handleWantToSlash([offense]);

      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
    });
  });

  describe('handleNewRound', () => {
    it.todo('clears expired payloads and offenses');
  });

  describe('handleProposalExecutable', () => {
    it('tracks executable payloads and marks offenses as not pending', async () => {
      const validator = EthAddress.random();
      const round = 1n;

      // Add pending offenses
      const slashedOffense = await addPendingOffense({ validator, epochOrSlot: 1n });
      const anotherOffense = await addPendingOffense({ validator, epochOrSlot: 2n });

      // Mock the payload
      const payload: SlashPayload = {
        address: EthAddress.random(),
        timestamp: BigInt(Date.now()),
        slashes: [
          {
            validator,
            amount: 100n,
            offenses: [slashedOffense],
          },
        ],
      };
      slashFactoryContract.getSlashPayloadFromEvents.mockResolvedValue(payload);

      // Trigger event
      await slasherClient.handleProposalExecutable(payload.address, round);

      // Check that payload is tracked as executable
      expect(slasherClient.getExecutablePayloads()).toContainEqual({ payload: payload.address, round });

      // Check that offense is removed from pending
      const pendingOffenses = await offensesStore.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(anotherOffense); // Only the other offense remains
    });

    it('stops signaling for override payload when it becomes executable', async () => {
      const overridePayload = EthAddress.random();
      slasherClient.updateConfig({ slashOverridePayload: overridePayload });

      const [overrideProposeAction] = await slasherClient.getProposePayloadActions(1n);
      assert(overrideProposeAction.type === 'vote-payload');
      expect(overrideProposeAction.payload).toEqual(overridePayload);

      await slasherClient.handleProposalExecutable(overridePayload, 1n);

      const afterOverrideExecutableActions = await slasherClient.getProposePayloadActions(1n);
      expect(afterOverrideExecutableActions).toHaveLength(0);
    });
  });

  describe('handleProposalExecuted', () => {
    it('removes payload from executable list', async () => {
      const payloadAddress = EthAddress.random();
      const round = 1n;

      await slasherClient.handleProposalExecutable(payloadAddress, round);
      expect(slasherClient.getExecutablePayloads()).toHaveLength(1);

      await slasherClient.handleProposalExecuted(payloadAddress, round);
      expect(slasherClient.getExecutablePayloads()).toHaveLength(0);
    });
  });

  describe('handleProposalSignalled', () => {
    it('adds votes to existing payloads', async () => {
      const round = 1n;

      // Add initial payload
      const { address: payloadAddress } = await addSlashPayload({ round });

      await slasherClient.handleProposalSignalled(payloadAddress, round, EthAddress.random());
      await slasherClient.handleProposalSignalled(payloadAddress, round, EthAddress.random());
      await slasherClient.handleProposalSignalled(payloadAddress, round, EthAddress.random());

      const updatedPayload = await payloadsStore.getPayloadAtRound(payloadAddress, round);
      expect(updatedPayload?.votes).toBe(4n);
    });

    it('fetches and stores new payloads', async () => {
      const payloadAddress = EthAddress.random();
      const round = 1n;
      const signaller = EthAddress.random();

      const payload: SlashPayload = {
        address: payloadAddress,
        slashes: [],
        timestamp: BigInt(Date.now()),
      };

      slashFactoryContract.getSlashPayloadFromEvents.mockResolvedValue(payload);
      slashingProposer.getPayloadSignals.mockResolvedValue(4n);

      await slasherClient.handleProposalSignalled(payloadAddress, round, signaller);

      const storedPayload = await payloadsStore.getPayloadAtRound(payloadAddress, round);
      expect(storedPayload).toBeDefined();
      expect(storedPayload?.votes).toBe(4n);
    });

    it('does not mix votes from different rounds', async () => {
      const payloadAddress = EthAddress.random();
      const signaller = EthAddress.random();

      const payload: SlashPayload = {
        address: payloadAddress,
        slashes: [],
        timestamp: BigInt(Date.now()),
      };

      slashFactoryContract.getSlashPayloadFromEvents.mockResolvedValue(payload);
      slashingProposer.getPayloadSignals.mockResolvedValue(3n);

      // Handle proposal in round 1
      await slasherClient.handleProposalSignalled(payloadAddress, 1n, signaller);

      // And it makes a comeback in round 2
      await slasherClient.handleProposalSignalled(payloadAddress, 2n, signaller);

      const storedPayload = await payloadsStore.getPayloadAtRound(payloadAddress, 2n);
      expect(storedPayload).toBeDefined();
      expect(storedPayload!.votes).toBe(1n);
      expect(storedPayload!.round).toBe(2n);
    });
  });

  describe('getProposerActions', () => {
    let newPayloadAddress: EthAddress;
    let slotNumber: bigint;
    let round: bigint;

    beforeEach(() => {
      round = 1n;
      slotNumber = 200n;
      newPayloadAddress = EthAddress.random();
      slashFactoryContract.getAddressAndIsDeployed.mockResolvedValue({
        address: newPayloadAddress,
        isDeployed: false,
        salt: '0xcafe',
      });

      jest.spyOn(slasherClient, 'agreeWithPayload').mockResolvedValue(true);
    });

    it('creates payload from pending offenses', async () => {
      const offense = await addPendingOffense({ epochOrSlot: 1n });

      const actions = await slasherClient.getProposerActions(slotNumber);

      // Should have both create and vote actions
      expect(actions).toHaveLength(2);
      expectActionCreatePayload(actions[0], offense);
      expectActionVotePayload(actions[1], newPayloadAddress);
    });

    it('votes for payload with highest score', async () => {
      // Add two payloads with different scores
      const { address: _payloadAddress1 } = await addSlashPayload({ amount: 50n, votes: 2n, round });
      const { address: payloadAddress2 } = await addSlashPayload({ amount: 100n, votes: 1n, round });

      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(1);
      expectActionVotePayload(actions[0], payloadAddress2);
    });

    it('does not vote for payloads not agreed with', async () => {
      // Add two payloads with different scores
      const { address: payloadAddress1 } = await addSlashPayload({ amount: 50n, votes: 2n, round });
      const { address: _payloadAddress2 } = await addSlashPayload({ amount: 100n, votes: 1n, round });

      // Mock that client agrees with first payload only
      jest
        .spyOn(slasherClient, 'agreeWithPayload')
        .mockImplementation(payload => Promise.resolve(payload.address.equals(payloadAddress1)));

      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(1);
      expectActionVotePayload(actions[0], payloadAddress1);
    });

    it('does not vote for payloads that will never get enough votes', async () => {
      await addSlashPayload({ amount: 50n, votes: 2n, round });

      slotNumber = 290n; // Too close to end of round to get payload enough votes
      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(0);
    });

    it('does not vote if a payload has already won', async () => {
      await addSlashPayload({ amount: 50n, votes: settings.slashingQuorumSize, round });

      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(0);
    });

    it('prefers creating a new payload if it has higher score', async () => {
      // Add two payloads with different scores
      const { address: _payloadAddress1 } = await addSlashPayload({ amount: 50n, votes: 2n, round });
      const { address: _payloadAddress2 } = await addSlashPayload({ amount: 100n, votes: 1n, round });

      // And adds an offense with very high amount
      const offense = await addPendingOffense({ epochOrSlot: 1n, amount: 1000n });

      // Mock that client agrees with both payloads
      jest.spyOn(slasherClient, 'agreeWithPayload').mockResolvedValue(true);

      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(2);

      expectActionCreatePayload(actions[0], offense);
      expectActionVotePayload(actions[1], newPayloadAddress);
    });

    it('does not create a new payload if out of nomination phase', async () => {
      // Add two payloads with different scores
      const { address: _payloadAddress1 } = await addSlashPayload({ amount: 50n, votes: 100n, round });
      const { address: payloadAddress2 } = await addSlashPayload({ amount: 100n, votes: 100n, round });

      // And adds an offense with very high amount
      const offense = await addPendingOffense({ epochOrSlot: 1n, amount: 10000000000000n });

      // If we are in nomination phase, we would create a new payload
      const nominationActions = await slasherClient.getProposerActions(slotNumber);
      expect(nominationActions).toHaveLength(2);
      expectActionCreatePayload(nominationActions[0], offense);

      // But we are too close to the end of the round to create a new payload
      const actions = await slasherClient.getProposerActions(290n);
      expect(actions).toHaveLength(1);
      expectActionVotePayload(actions[0], payloadAddress2);
    });

    it('prefers voting for existing payloads over creating new ones', async () => {
      // Add two existing payloads with different scores
      const { address: _payloadAddress1 } = await addSlashPayload({ amount: 50n, votes: 2n, round });
      const { address: payloadAddress2 } = await addSlashPayload({ amount: 100n, votes: 1n, round }); // Higher score

      // And adds an offense with lower amount
      const _offense = await addPendingOffense({ epochOrSlot: 1n, amount: 10n });

      // Mock that client agrees with both payloads
      jest.spyOn(slasherClient, 'agreeWithPayload').mockResolvedValue(true);

      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toHaveLength(1);
      expectActionVotePayload(actions[0], payloadAddress2);
    });

    it('executes eligible payloads', async () => {
      const payloadAddress = EthAddress.random();
      const payloadRound = 1n;
      const currentRound = 4n; // After execution delay of 2 rounds

      slasherClient.getExecutablePayloads().push({ payload: payloadAddress, round: payloadRound });

      const roundInfo = { executed: false } as Awaited<ReturnType<SlashingProposerContract['getRoundInfo']>>;
      slashingProposer.getRoundInfo.mockResolvedValue(roundInfo);

      const slotNumber = currentRound * settings.slashingRoundSize;
      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).toContainEqual({
        type: 'execute-payload',
        round: payloadRound,
      });
    });

    it('does not execute payloads before execution delay', async () => {
      const payloadAddress = EthAddress.random();
      const payloadRound = 1n;
      const currentRound = 2n; // Not yet past execution delay

      slasherClient.getExecutablePayloads().push({ payload: payloadAddress, round: payloadRound });

      const roundInfo = { executed: false } as Awaited<ReturnType<SlashingProposerContract['getRoundInfo']>>;
      slashingProposer.getRoundInfo.mockResolvedValue(roundInfo);

      const slotNumber = currentRound * settings.slashingRoundSize;
      const actions = await slasherClient.getProposerActions(slotNumber);

      expect(actions).not.toContainEqual(
        expect.objectContaining({
          type: 'execute-payload',
        }),
      );
    });

    it('returns override payload when configured', async () => {
      const { address: _payloadAddress } = await addSlashPayload({ amount: 100n, votes: 100n, round: 1n });

      const overridePayload = EthAddress.random();
      slasherClient.updateConfig({ slashOverridePayload: overridePayload });

      const actions = await slasherClient.getProposerActions(100n);

      expect(actions).toHaveLength(1);
      expectActionVotePayload(actions[0], overridePayload);
    });

    it('stops using override payload after it becomes executable', async () => {
      const offense = await addPendingOffense({ epochOrSlot: 1n });
      const overridePayload = EthAddress.random();
      slasherClient.updateConfig({ slashOverridePayload: overridePayload });

      // First action should be to vote for override
      let actions = await slasherClient.getProposerActions(slotNumber);
      expectActionVotePayload(actions[0], overridePayload);

      // Simulate override becoming executable
      await slasherClient.handleProposalExecutable(overridePayload, 1n);

      // Should now return action based on pending offenses, not override
      actions = await slasherClient.getProposerActions(200n);
      expect(actions).toHaveLength(2);
      expectActionCreatePayload(actions[0], offense);
      expectActionVotePayload(actions[1], newPayloadAddress);
    });
  });

  describe('gatherOffensesForRound', () => {
    it('only includes offenses from previous rounds', async () => {
      const offenseType = OffenseType.PROPOSED_INCORRECT_ATTESTATIONS;
      const offense1 = await addPendingOffense({ offenseType, epochOrSlot: 1n });
      const _offense2 = await addPendingOffense({ offenseType, epochOrSlot: 10000n });

      const offenses = await slasherClient.gatherOffensesForRound(1n);

      expect(offenses).toHaveLength(1);
      expect(offenses[0]).toEqual(offense1);
    });

    it('does not include expired offenses', async () => {
      const offenseType = OffenseType.INACTIVITY;
      const _offense1 = await addPendingOffense({ offenseType, epochOrSlot: 1n });
      const offense2 = await addPendingOffense({ offenseType, epochOrSlot: 100n });

      const offenses = await slasherClient.gatherOffensesForRound(20n);

      expect(offenses).toHaveLength(1);
      expect(offenses[0]).toEqual(offense2);
    });

    it('does not include slashed offenses', async () => {
      const offenseType = OffenseType.PROPOSED_INCORRECT_ATTESTATIONS;
      const offense1 = await addPendingOffense({ offenseType, epochOrSlot: 1n });
      const offense2 = await addPendingOffense({ offenseType, epochOrSlot: 1n });

      await offensesStore.markAsSlashed([offense1]);

      const offenses = await slasherClient.gatherOffensesForRound(1n);

      expect(offenses).toHaveLength(1);
      expect(offenses[0]).toEqual(offense2);
    });

    it('respects max payload size', async () => {
      expect(config.slashMaxPayloadSize).toBeLessThan(150);

      const offenses: Offense[] = [];
      for (let i = 0; i < 150; i++) {
        offenses.push({
          validator: EthAddress.random(),
          amount: BigInt(1000 - i), // Decreasing amounts
          offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
          epochOrSlot: 1n,
        });
      }

      for (const offense of offenses) {
        await addPendingOffense(offense);
      }

      const gathered = await slasherClient.gatherOffensesForRound(1n);
      expect(gathered).toHaveLength(config.slashMaxPayloadSize);

      // Should have the highest amounts
      const amounts = gathered.map(o => o.amount).sort((a, b) => Number(b - a));
      expect(amounts[0]).toBe(1000n);
      expect(amounts[amounts.length - 1]).toBe(BigInt(1000 - config.slashMaxPayloadSize + 1));
    });

    it('always includes uncontroversial offenses', async () => {
      // Generates subjective offenses with high amount, and uncontroversial ones with lower
      const subjectiveOffenses: Offense[] = [];
      const uncontroversialOffenses: Offense[] = [];
      for (let i = 0; i < 90; i++) {
        subjectiveOffenses.push({
          validator: EthAddress.random(),
          amount: BigInt(10000 - i), // Decreasing amounts
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 1n,
        });

        uncontroversialOffenses.push({
          validator: EthAddress.random(),
          amount: BigInt(1000 - i),
          offenseType: OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
          epochOrSlot: 1n,
        });
      }

      for (const offense of [...subjectiveOffenses, ...uncontroversialOffenses]) {
        await addPendingOffense(offense);
      }

      const gathered = await slasherClient.gatherOffensesForRound(2n);
      expect(gathered).toHaveLength(config.slashMaxPayloadSize);

      // Should have all uncontroversial ones
      const uncontroversialOffenseValidators = uncontroversialOffenses.map(o => o.validator.toString());
      expect(gathered.map(o => o.validator.toString())).toEqual(
        expect.arrayContaining(uncontroversialOffenseValidators),
      );
    });
  });

  describe('agreeWithPayload', () => {
    it.todo('agrees if offenses match');

    it.todo('disagrees if a single offense is not present');

    it.todo('disagrees if a single offense has already been slashed');

    it.todo('disagrees if a single offense is not for this round');

    it.todo('disagrees if amount is out of range');

    it.todo('disagrees if payload exceeds max size');

    it.todo('disagrees if it does not include all uncontroversial offenses');
  });

  describe('calculatePayloadScore', () => {
    it('is proportional to number of votes', () => {
      const slashes = [
        { validator: EthAddress.random(), amount: 100n, offenses: [] },
        { validator: EthAddress.random(), amount: 50n, offenses: [] },
      ];

      const payload1 = { votes: 10n, slashes };
      const payload2 = { votes: 20n, slashes };

      const score1 = slasherClient.calculatePayloadScore(payload1);
      const score2 = slasherClient.calculatePayloadScore(payload2);

      expect(score2).toBeGreaterThan(score1);
    });

    it('is proportional to slash amount', () => {
      const payload1 = { votes: 10n, slashes: [{ validator: EthAddress.random(), amount: 100n, offenses: [] }] };
      const payload2 = { votes: 10n, slashes: [{ validator: EthAddress.random(), amount: 200n, offenses: [] }] };

      const score1 = slasherClient.calculatePayloadScore(payload1);
      const score2 = slasherClient.calculatePayloadScore(payload2);

      expect(score2).toBeGreaterThan(score1);
    });
  });
});

class TestSlasherClient extends SlasherClient {
  constructor(
    config: SlasherConfig,
    settings: SlasherSettings,
    slashFactoryContract: SlashFactoryContract,
    slashingProposer: SlashingProposerContract,
    rollupAddress: EthAddress,
    watchers: Watcher[],
    dateProvider: DateProvider,
    offensesStore: SlasherOffensesStore,
    payloadsStore: SlasherPayloadsStore,
    log: Logger = createLogger('slasher:test'),
  ) {
    super(
      config,
      settings,
      slashFactoryContract,
      slashingProposer,
      rollupAddress,
      watchers,
      dateProvider,
      offensesStore,
      payloadsStore,
      log,
    );
  }

  public override handleWantToSlash(args: WantToSlashArgs[]): Promise<void> {
    return super.handleWantToSlash(args);
  }

  public override handleNewRound(round: bigint): Promise<void> {
    return super.handleNewRound(round);
  }

  public override handleProposalExecutable(payloadAddress: EthAddress, round: bigint): Promise<void> {
    return super.handleProposalExecutable(payloadAddress, round);
  }

  public override handleProposalExecuted(payload: EthAddress, round: bigint): Promise<void> {
    return super.handleProposalExecuted(payload, round);
  }

  public override handleProposalSignalled(
    payloadAddress: EthAddress,
    round: bigint,
    signaller: EthAddress,
  ): Promise<void> {
    return super.handleProposalSignalled(payloadAddress, round, signaller);
  }

  public override gatherOffensesForRound(round: bigint): Promise<Offense[]> {
    return super.gatherOffensesForRound(round);
  }

  public override calculatePayloadScore(payload: Pick<SlashPayloadRound, 'votes' | 'slashes'>): bigint {
    return super.calculatePayloadScore(payload);
  }

  public getExecutablePayloads() {
    return this.executablePayloads;
  }

  public override getExecutePayloadAction(slotNumber: bigint): Promise<ProposerSlashAction | undefined> {
    return super.getExecutePayloadAction(slotNumber);
  }

  public override getProposePayloadActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
    return super.getProposePayloadActions(slotNumber);
  }

  public override agreeWithPayload(
    payload: SlashPayload,
    round: bigint,
    cachedUncontroversialOffenses?: Offense[],
  ): Promise<boolean> {
    return super.agreeWithPayload(payload, round, cachedUncontroversialOffenses);
  }
}

class DummyWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  public triggerSlash(args: WantToSlashArgs[]) {
    this.emit(WANT_TO_SLASH_EVENT, args);
  }
}
