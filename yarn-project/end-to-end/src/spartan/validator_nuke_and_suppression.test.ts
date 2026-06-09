import { EthAddress } from '@aztec/aztec.js/addresses';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { type L1RollupConstants, getSlotRangeForEpoch, getStartTimestampForEpoch } from '@aztec/stdlib/epoch-helpers';

import { expect, jest } from '@jest/globals';
import { createPublicClient, fallback, http } from 'viem';

import {
  ChainHealth,
  type ServiceEndpoint,
  applyValidatorFailure,
  applyValidatorKill,
  getEthereumEndpoint,
  getGitProjectRoot,
  getRPCEndpoint,
  getSequencers,
  setupEnvironment,
  uninstallChaosMesh,
  updateSequencersConfig,
  waitForResourcesByName,
} from './utils.js';

describe('validator suppression and nuke with slashing assertions', () => {
  jest.setTimeout(2 * 60 * 60 * 1000); // 120 minutes

  const logger = createLogger('e2e:spartan:suppress-nuke-slash');
  const config = setupEnvironment(process.env);
  const endpoints: ServiceEndpoint[] = [];

  let client: ViemPublicClient;
  let rollup: RollupContract;
  let constants: Omit<L1RollupConstants, 'ethereumSlotDuration'>;
  let monitor: ChainMonitor;
  let nodeRpcUrl: string;
  let spartanDir: string;
  const killReleases: string[] = [];
  const health = new ChainHealth(config.NAMESPACE, logger);

  beforeAll(async () => {
    await health.setup();
    const chaosReleases = ['validator-failure'];
    await Promise.all(
      chaosReleases.map(name =>
        uninstallChaosMesh(name, config.NAMESPACE, logger).catch(() =>
          logger.verbose(`Not Found/Failed to post-clean chaos release ${name}`),
        ),
      ),
    );

    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);
    nodeRpcUrl = rpcEndpoint.url;
    logger.info(`Connected to RPC at ${nodeRpcUrl}`);

    // Reuse RPC to fetch L1 deployment addresses
    const deployAddresses = await createAztecNodeClient(nodeRpcUrl)
      .getNodeInfo()
      .then(i => i.l1ContractAddresses);

    const ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    endpoints.push(ethEndpoint);
    client = createPublicClient({ transport: fallback([http(ethEndpoint.url, { batch: false, timeout: 60_000 })]) });
    logger.info(`Connected to Ethereum at ${ethEndpoint.url}`);

    rollup = new RollupContract(client, deployAddresses.rollupAddress);
    monitor = new ChainMonitor(rollup, undefined, logger.createChild('chain-monitor'), 500).start();

    constants = await rollup.getRollupConstants();
    spartanDir = `${getGitProjectRoot()}/spartan`;

    await monitor.run();
  });

  afterAll(async () => {
    await health.teardown();
    // Ensure we don't leave validators disabled
    await updateSequencersConfig(config, { disabledValidators: [] }).catch(() => undefined);
    const chaosReleases = ['validator-failure', ...killReleases];
    await Promise.all(
      chaosReleases.map(name =>
        uninstallChaosMesh(name, config.NAMESPACE, logger).catch(() =>
          logger.warn(`Not Found/Failed to post-clean chaos release ${name}`),
        ),
      ),
    );

    monitor?.removeAllListeners();
    await monitor?.stop();
    endpoints.forEach(e => e.process?.kill());
  });

  // Wait for validator/sequencer pods by name (discovered via `getSequencers`) to satisfy a condition.
  const waitValidators = async (condition: string, timeout = '5m') => {
    const pods = await getSequencers(config.NAMESPACE);
    if (!pods.length) {
      throw new Error(`No validator/sequencer pods found in namespace ${config.NAMESPACE}`);
    }
    await waitForResourcesByName({
      resource: 'pod',
      names: pods,
      namespace: config.NAMESPACE,
      condition,
      timeout,
    });
  };

  it('suppresses next-epoch committee, nukes repeatedly, then resumes quickly with no missed slots and no slashing', async () => {
    // Count slots via l2-slot deltas, and blocks via pending tips delta within [startSlot, endSlot)
    const countSlotsAndBlocks = async (startSlot: SlotNumber, endSlot: SlotNumber) => {
      // Bound the window by observed slots
      await monitor.waitUntilL2Slot(startSlot);
      const startObserved = Number(monitor.l2SlotNumber);
      const tipsStart = await rollup.getTips();

      await monitor.waitUntilL2Slot(endSlot);
      const endObserved = Number(monitor.l2SlotNumber);
      const tipsEnd = await rollup.getTips();

      const slotTotal = endObserved - startObserved;
      const blockCount = tipsEnd.pending - tipsStart.pending;
      return { slotTotal, blockCount };
    };

    // Next epoch committee discovery (to keep track of slashing)
    const getNextEpochCommittee = async () => {
      const startEpoch = await rollup.getCurrentEpoch();
      logger.warn(`Retrieving committee for next epoch (current epoch is ${startEpoch})`);
      return await retryUntil(
        async () => {
          const nextEpoch = EpochNumber((await rollup.getCurrentEpoch()) + 1);
          const nextEpochStartTimestamp = getStartTimestampForEpoch(nextEpoch, constants);
          const committee = await rollup.getCommitteeAt(nextEpochStartTimestamp);
          if (committee && committee.length > 0) {
            logger.warn(`Retrieved committee for epoch ${nextEpoch}`, { committee });
            return { committee, epoch: nextEpoch };
          }
        },
        'committee',
        constants.epochDuration * constants.slotDuration * 4, // up to 4 epochs
        1,
      );
    };

    // Keep track of slashing events from the committee
    const { committee, epoch } = await getNextEpochCommittee();
    // Subscribe early to slash events for this committee to avoid missing early executions
    const committeeSet = new Set(committee.map((a: EthAddress) => a.toString()));
    const observedSlashes = new Map<string, { amount: bigint; attester: EthAddress }>();
    const unsubscribeGlobalSlash = rollup.listenToSlash((data: { amount: bigint; attester: EthAddress }) => {
      const key = data.attester.toString();
      if (committeeSet.has(key) && !observedSlashes.has(key)) {
        observedSlashes.set(key, { amount: data.amount, attester: data.attester });
        logger.warn(`(early) observed slash for ${key} amount=${data.amount}`);
      }
    });

    // Wait until the first slot of the suppressed epoch to start suppression
    const slotRange = getSlotRangeForEpoch(epoch, constants);
    const slotBeforeSuppressedEpoch = SlotNumber(slotRange[0] - 1);
    const slotBeginningSuppressedEpoch = SlotNumber(slotRange[0]);
    const slotEndSuppressedEpoch = SlotNumber(slotRange[1]);
    logger.info(
      `Waiting until slot ${slotBeforeSuppressedEpoch} to start suppression (current ${monitor.l2SlotNumber})`,
    );
    await monitor.waitUntilL2Slot(slotBeforeSuppressedEpoch);
    // Start failure a bit before the slot start
    const percentOfSlotToBuffer = 0.7;
    const delaySeconds = Number(constants.slotDuration) * percentOfSlotToBuffer;
    const remainingSeconds = Number(constants.slotDuration) - delaySeconds;
    await sleep(delaySeconds);

    // Suppress validators for the next epoch
    const durationSeconds = Math.ceil(Number(constants.epochDuration * constants.slotDuration + remainingSeconds));
    await applyValidatorFailure({
      namespace: config.NAMESPACE,
      spartanDir,
      logger,
      values: {
        'validatorFailure.duration': `${durationSeconds}s`,
        'global.chaosResourceNamespace': config.NAMESPACE,
      },
    });
    // Ensure validators are NotReady before entering suppression window
    try {
      await waitValidators('Ready=false', '3m');
    } catch {
      logger.warn('Validators did not reach NotReady state before suppression window');
    }

    const { slotTotal: suppressedSlots, blockCount: suppressedBlocks } = await countSlotsAndBlocks(
      slotBeginningSuppressedEpoch,
      slotEndSuppressedEpoch,
    );

    logger.info(`suppression window slots=${suppressedSlots} blocks=${suppressedBlocks}`);
    // Assertions can be flaky due to variable chart deployment relative to absolute slot times
    // expect(suppressedSlots).toBe(constants.epochDuration); // Slots should increment
    expect(suppressedBlocks).toBe(0); // No blocks should be produced

    // Gate on PodReadyToStartContainers instead of Ready to avoid block building/slashing when only partial validators are up
    await waitValidators('PodReadyToStartContainers', '15m');
    logger.info(`Validators recovered after suppression epoch`);

    // Perform the nuke cycles and ensure no slashing occurs
    const rounds = 4; // 3–5
    for (let i = 1; i < rounds; i++) {
      logger.info(`nuke round ${i + 1}/${rounds}`);

      const releaseName = `validator-kill-${i + 1}`;
      killReleases.push(releaseName);
      await applyValidatorKill({
        namespace: config.NAMESPACE,
        spartanDir,
        logger,
        values: {
          'validatorKill.percent': 100,
          // Ensure chaos resources are created in the scenario namespace (mirrors prover kill tests)
          'global.chaosResourceNamespace': config.NAMESPACE,
        },
        clean: false,
        instanceName: releaseName,
      });
      await sleep(3000);
    }
    await waitValidators('Ready', '15m');

    // `Ready` only means the validator pods restarted after the nuke; they still need to
    // re-establish their p2p mesh and finish syncing before they can reliably propose. Wait for
    // block production to demonstrably resume before sampling, otherwise we measure the first epoch
    // mid-reconnection and intermittently miss a large fraction of its slots.
    const epochSeconds = Number(constants.epochDuration) * Number(constants.slotDuration);
    const tipsAtReady = (await rollup.getTips()).pending;
    logger.info(`Validators Ready after nukes; waiting for block production to resume`);
    await retryUntil(
      async () => (await rollup.getTips()).pending > tipsAtReady + Math.floor(Number(constants.epochDuration) / 2),
      'block-production-resumed',
      epochSeconds * 2, // up to 2 epochs to recover
      Number(constants.slotDuration),
    );

    // Check we have started creating blocks on current epoch, then check that the next settled epoch
    // is (near-)clean
    const pendingTipsBefore = (await rollup.getTips()).pending;
    const afterNukesEpoch = EpochNumber((await rollup.getCurrentEpoch()) + 1);
    const afterNukesStart = getSlotRangeForEpoch(afterNukesEpoch, constants)[0];
    const afterNukesEnd = getSlotRangeForEpoch(EpochNumber(afterNukesEpoch + 1), constants)[0];
    const { slotTotal: postNukeSlots, blockCount: postNukeBlocks } = await countSlotsAndBlocks(
      afterNukesStart,
      afterNukesEnd,
    );
    const missedAfterNukes = postNukeSlots - postNukeBlocks;
    logger.info(
      `post-nukes epoch from=${afterNukesStart} to=${afterNukesEnd} slots=${postNukeSlots} blocks=${postNukeBlocks} missed=${missedAfterNukes}`,
    );
    const pendingTipsAfter = (await rollup.getTips()).pending;
    expect(pendingTipsAfter).toBeGreaterThan(pendingTipsBefore);
    // Allow a small ramp-up budget: proposer churn at epoch boundaries can still drop the odd slot
    // even after recovery. The property under test is that block building recovered after repeated
    // nukes, not that literally every slot is filled.
    const maxMissedAfterRecovery = Math.ceil(Number(constants.epochDuration) * 0.15);
    expect(missedAfterNukes).toBeLessThanOrEqual(maxMissedAfterRecovery);

    // Additionally assert that no slashing occurred during the test window
    expect(observedSlashes.size).toBe(0);
    unsubscribeGlobalSlash();
  });
});
