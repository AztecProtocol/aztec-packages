import { EthAddress } from '@aztec/aztec.js/addresses';
import { RollupContract, type ViemPublicClient } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { timeoutPromise } from '@aztec/foundation/timer';
import { type TallySlasherSettings, getTallySlasherSettings } from '@aztec/slasher';
import { type L1RollupConstants, getSlotRangeForEpoch, getStartTimestampForEpoch } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import {
  applyNetworkPartition,
  applyValidatorFailureForPods,
  getGitProjectRoot,
  getL1DeploymentAddresses,
  getPublicViemClient,
  getSequencers,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';

describe('slash with partitions', () => {
  jest.setTimeout(120 * 60 * 1000); // 120 minutes

  const logger = createLogger('e2e:slash-partitions');
  const config = setupEnvironment(process.env);
  const forwardProcesses: ChildProcess[] = [];

  let client: ViemPublicClient;
  let rollup: RollupContract;
  let slashSettings: TallySlasherSettings;
  let constants: Omit<L1RollupConstants, 'ethereumSlotDuration'>;
  let monitor: ChainMonitor;

  beforeAll(async () => {
    const deployAddresses = await getL1DeploymentAddresses(config);
    ({ client } = await getPublicViemClient(config, forwardProcesses));
    rollup = new RollupContract(client, deployAddresses.rollupAddress);
    monitor = new ChainMonitor(rollup, undefined, logger.createChild('chain-monitor'), 500).start();
    constants = await rollup.getRollupConstants();
    slashSettings = await getTallySlasherSettings(rollup);
  });

  afterAll(async () => {
    await updateSequencersConfig(config, { disabledValidators: [], slashValidatorsNever: [] });
    monitor.removeAllListeners();
    await monitor.stop();
    forwardProcesses.forEach(p => p.kill());
  });

  const getNextEpochCommittee = async () => {
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
      constants.epochDuration * constants.slotDuration * 4,
      1,
    );
  };

  const waitForSlash = async (who: EthAddress, timeoutSeconds: number) => {
    const proposer = await rollup.getSlashingProposer();
    if (!proposer || proposer.type !== 'tally') {
      throw new Error('expected tally proposer');
    }
    proposer.listenToVoteCast(
      args => void logger.warn(`Slash vote round ${args.round} by ${args.proposer.toString()}`),
    );
    const p = promiseWithResolvers<{ amount: bigint; attester: EthAddress }>();
    const unsub = rollup.listenToSlash(data => {
      if (data.attester.equals(who)) {
        logger.warn(`Slashed ${who.toString()} for ${data.amount}`);
        unsub();
        p.resolve(data);
      }
    });
    return Promise.race([p.promise, timeoutPromise(timeoutSeconds * 1000)]);
  };

  const getTotalSlashDelaySeconds = () => {
    const { slashingOffsetInRounds, slashingExecutionDelayInRounds, slashingRoundSizeInEpochs } = slashSettings;
    const epochSec = Number(constants.epochDuration * constants.slotDuration);
    const totalEpochs = slashingRoundSizeInEpochs * (slashingOffsetInRounds + slashingExecutionDelayInRounds + 1);
    return epochSec * totalEpochs;
  };

  it('slashes across network partitions and slashes the offline subset', async () => {
    void getGitProjectRoot(); // ensure repo root is resolvable (used by helm paths in utils)

    monitor.on('l2-epoch', args => logger.warn(`Current epoch is ${args.l2EpochNumber}`, args));
    await monitor.run();

    const configs = await getSequencersConfig(config);
    configs.forEach(c => logger.info(`Loaded initial sequencer config`, c));

    const pods = (await getSequencers(config.NAMESPACE)).filter(Boolean);
    expect(pods.length).toBeGreaterThanOrEqual(3);
    const oneThird = Math.max(1, Math.floor(pods.length / 3));
    const groupA = pods.slice(0, oneThird);
    const groupB = pods.slice(oneThird);
    const groupA2 = groupA.slice(0, Math.max(1, Math.floor(groupA.length / 3)));

    const { epoch } = await getNextEpochCommittee();
    const lastSlotBeforeEpoch = getSlotRangeForEpoch(epoch, constants)[0] - 1n;
    await monitor.waitUntilL2Slot(lastSlotBeforeEpoch);

    const inactivityPenalty = slashSettings.slashingAmounts[0];
    await updateSequencersConfig(config, {
      slashSelfAllowed: true,
      slashValidatorsNever: [],
      slashInactivityPenalty: inactivityPenalty,
      slashInactivityTargetPercentage: 0.7,
    });

    const epochsToPartition = 3;
    const partitionDuration = Number(constants.epochDuration * constants.slotDuration) * epochsToPartition;
    await applyNetworkPartition({
      namespace: config.NAMESPACE,
      spartanDir: `${getGitProjectRoot()}/spartan`,
      logger,
      groupA,
      groupB,
      durationSeconds: partitionDuration,
    });

    const offlineEpochs = 2;
    const offlineDuration = Number(constants.epochDuration * constants.slotDuration) * offlineEpochs;
    await applyValidatorFailureForPods({
      namespace: config.NAMESPACE,
      spartanDir: `${getGitProjectRoot()}/spartan`,
      logger,
      podNames: groupA2,
      durationSeconds: offlineDuration,
    });

    const endOfPartitionSlot = getSlotRangeForEpoch(epoch + BigInt(epochsToPartition), constants)[0] - 1n;
    await monitor.waitUntilL2Slot(endOfPartitionSlot);

    const timeout = getTotalSlashDelaySeconds() + 60;
    const { committee } = await getNextEpochCommittee();
    const candidates = committee.slice(0, Math.min(3, committee.length)).map(EthAddress.fromString);

    const results = await Promise.all(candidates.map(a => waitForSlash(a, timeout).catch(() => undefined)));
    const anySlashed = results.some(r => r !== undefined);
    expect(anySlashed).toBe(true);
  });
});
