import { EthAddress, retryUntil } from '@aztec/aztec.js';
import { RollupContract, type ViemPublicClient } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type SlasherConfig, type TallySlasherSettings, getTallySlasherSettings } from '@aztec/slasher';
import { type L1RollupConstants, getSlotRangeForEpoch, getStartTimestampForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import assert from 'assert';
import type { ChildProcess } from 'child_process';

import {
  getL1DeploymentAddresses,
  getPublicViemClient,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';

const config = setupEnvironment(process.env);

// This test disables a specific validator from all nodes via the `disabledValidators` configuration,
// which will cause the node that handles that validator to NOT propose or attest using it. This still
// allows us to run multiple validators per node but disable a single one, as opposed to having to
// disable every validator on a node.
describe('slash inactivity test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createLogger(`e2e:slash-inactivity`);

  const forwardProcesses: ChildProcess[] = [];

  let client: ViemPublicClient;
  let rollup: RollupContract;
  let slashSettings: TallySlasherSettings;
  let constants: Omit<L1RollupConstants, 'ethereumSlotDuration'>;
  let monitor: ChainMonitor;
  let offlineValidator: EthAddress;

  beforeAll(async () => {
    const deployAddresses = await getL1DeploymentAddresses(config);
    ({ client } = await getPublicViemClient(config, forwardProcesses));
    rollup = new RollupContract(client, deployAddresses.rollupAddress);
    monitor = new ChainMonitor(rollup, undefined, logger.createChild('chain-monitor'), 500).start();
    constants = await rollup.getRollupConstants();
    slashSettings = await getTallySlasherSettings(rollup);
  });

  afterAll(async () => {
    // Clear out the disabled validators so we don't affect other tests
    await updateSequencersConfig(config, { disabledValidators: [] });
    monitor.removeAllListeners();
    await monitor.stop();
    forwardProcesses.forEach(p => p.kill());
  });

  /** Returns the committee for the next epoch. If not defined yet, waits until it is. */
  const getNextEpochCommittee = async () => {
    const startEpoch = await rollup.getCurrentEpoch();
    logger.warn(`Retrieving committee for next epoch (current epoch is ${startEpoch})`);
    return await retryUntil(
      async () => {
        const nextEpoch = (await rollup.getCurrentEpoch()) + 1n;
        const nextEpochStartTimestamp = getStartTimestampForEpoch(nextEpoch, constants);
        const committee = await rollup.getCommitteeAt(nextEpochStartTimestamp);

        if (committee && committee.length > 0) {
          logger.warn(`Retrieved committee for epoch ${nextEpoch}`, { committee });
          return { committee, epoch: nextEpoch };
        }
      },
      'committee',
      constants.epochDuration * constants.slotDuration * 4, // 4 epochs
      1,
    );
  };

  /** Waits for a slash event on the given validator */
  const waitForSlash = async (who: EthAddress, timeoutSeconds: number) => {
    logger.warn(`Waiting for ${who.toString()} to be slashed (times out in ${timeoutSeconds}s)`);

    // Log every slash vote event
    const proposer = await rollup.getSlashingProposer();
    assert(proposer!.type === 'tally', 'Expected tally slashing proposer');
    proposer!.listenToVoteCast(
      args =>
        void (async () => {
          const vote = await proposer!.getLastVote(args.round).catch(() => undefined);
          logger.warn(`Slash vote casted by ${args.proposer.toString()} in round ${args.round}`, { vote });
        })(),
    );

    // Wait for a slash event for the given validator
    const promise = promiseWithResolvers<{ amount: bigint; attester: EthAddress }>();
    const unsubscribe = rollup.listenToSlash(data => {
      if (data.attester.equals(who)) {
        logger.warn(`Validator ${who.toString()} has been slashed for ${data.amount}`, data);
        unsubscribe();
        promise.resolve(data);
      } else {
        logger.info(`Received slash event for other validator ${data.attester.toString()}`, data);
      }
    });

    return Promise.race([promise.promise, timeoutPromise(timeoutSeconds * 1000)]);
  };

  /** Computes total number of seconds to wait until a slash happens (considers slash offset, execution delay, and a +1 for good measure) */
  const getTotalSlashDelayInSeconds = () => {
    const { slashingOffsetInRounds, slashingExecutionDelayInRounds, slashingRoundSizeInEpochs } = slashSettings;
    const epochDurationInSeconds = Number(constants.epochDuration * constants.slotDuration);
    const totalSlashDelayInEpochs =
      slashingRoundSizeInEpochs * (slashingOffsetInRounds + slashingExecutionDelayInRounds + 1);
    return epochDurationInSeconds * totalSlashDelayInEpochs;
  };

  it('slashes inactive validator', async () => {
    // Log on new epochs and initial sequencer configs
    monitor.on('l2-epoch', args => logger.warn(`Current epoch is ${args.l2EpochNumber}`, args));
    await monitor.run();

    // Log initial sequencer configs for debugging purposes
    const configs = await getSequencersConfig(config);
    configs.forEach(c => logger.info(`Loaded initial sequencer config`, c));

    // Choose the first committee member for the next epoch as the validator to disable
    const { committee, epoch } = await getNextEpochCommittee();
    offlineValidator = EthAddress.fromString(committee[0]);

    // Wait until we're near the end of the previous epoch
    const lastSlotBeforeEpoch = getSlotRangeForEpoch(epoch, constants)[0] - 1n;
    logger.warn(`Waiting until slot ${lastSlotBeforeEpoch} (current is ${monitor.l2SlotNumber})`);
    await monitor.waitUntilL2Slot(lastSlotBeforeEpoch);

    // And disable that validator from all sequencers, as well as allowing all slashes, and set inactivity penalty
    const inactivityPenalty = slashSettings.slashingAmounts[0];
    const slashAllConfig: Partial<SlasherConfig> = {
      slashSelfAllowed: true,
      slashValidatorsNever: [],
      slashInactivityPenalty: inactivityPenalty,
      slashInactivityTargetPercentage: 0.7,
    };
    const updated = await updateSequencersConfig(config, { disabledValidators: [offlineValidator], ...slashAllConfig });
    logger.warn(`Updated sequencer configs to disable ${offlineValidator}`, { configs: updated });

    // Sanity check updated configs
    for (const sequencerConfig of updated) {
      expect(sequencerConfig.slashValidatorsNever).toBeEmpty();
      expect(sequencerConfig.disabledValidators.map(a => a.toString())).toContain(offlineValidator.toString());
      expect(sequencerConfig.slashInactivityPenalty).toEqual(inactivityPenalty);
      expect(sequencerConfig.slashInactivityTargetPercentage).toEqual(0.7);
    }

    // Wait for an epoch, then reenable the validator, otherwise it will get slashed for every epoch
    // for the slashed round, plus the slash offset, plus the execution delay, which would kick them out.
    const lastSlotBeforeNextEpoch = getSlotRangeForEpoch(epoch + 1n, constants)[0] - 1n;
    logger.warn(`Waiting until end of epoch ${epoch + 1n} at slot ${lastSlotBeforeNextEpoch}`);
    await monitor.waitUntilL2Slot(lastSlotBeforeNextEpoch);
    await updateSequencersConfig(config, { disabledValidators: [] });
    logger.warn(`Updated sequencer configs to reenable ${offlineValidator}`);

    // Now we wait for the slash
    const beforeSlash = await rollup.getAttesterView(offlineValidator);
    const timeout = getTotalSlashDelayInSeconds() + 60;
    await waitForSlash(offlineValidator, timeout);
    const afterSlash = await rollup.getAttesterView(offlineValidator);

    // The validator should have been slashed for their inactivity during the epoch it was disabled
    logger.warn(`Verifying slash for ${slashSettings.slashingAmounts[0]}`, { beforeSlash, afterSlash });
    const slashed = beforeSlash.effectiveBalance - afterSlash.effectiveBalance;
    expect(slashed).toEqual(inactivityPenalty);
  });
});
