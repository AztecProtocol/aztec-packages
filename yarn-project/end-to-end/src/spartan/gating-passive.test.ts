import { createCompatibleClient, sleep } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import type { AlertConfig } from '../quality_of_service/alert_checker.js';
import {
  applyBootNodeFailure,
  applyNetworkShaping,
  applyValidatorKill,
  awaitL2BlockNumber,
  enableValidatorDynamicBootNode,
  isK8sConfig,
  restartBot,
  runAlertCheck,
  setupEnvironment,
  startPortForward,
} from './utils.js';

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'avg_over_time(aztec_sequencer_time_to_collect_attestations[2m]) > 2500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
  {
    // Checks that we are not syncing from scratch each time we reboot
    alert: 'ArchiverL1BlocksSynced',
    expr: 'rate(aztec_archiver_l1_blocks_synced[1m]) > 0.5',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}
const { NAMESPACE, CONTAINER_PXE_PORT, CONTAINER_ETHEREUM_PORT, SPARTAN_DIR, INSTANCE_NAME } = config;
const debugLogger = createLogger('e2e:spartan-test:gating-passive');

describe('a test that passively observes the network in the presence of network chaos', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  let ETHEREUM_HOST: string;
  let PXE_URL: string;
  const forwardProcesses: ChildProcess[] = [];

  afterAll(async () => {
    await runAlertCheck(config, qosAlerts, debugLogger);
    forwardProcesses.forEach(p => p.kill());
  });

  it('survives network chaos', async () => {
    const { process: pxeProcess, port: pxePort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: NAMESPACE,
      containerPort: CONTAINER_PXE_PORT,
    });
    forwardProcesses.push(pxeProcess);
    PXE_URL = `http://127.0.0.1:${pxePort}`;

    const { process: ethProcess, port: ethPort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
      namespace: NAMESPACE,
      containerPort: CONTAINER_ETHEREUM_PORT,
    });
    forwardProcesses.push(ethProcess);
    ETHEREUM_HOST = `http://127.0.0.1:${ethPort}`;

    const client = await createCompatibleClient(PXE_URL, debugLogger);
    const ethCheatCodes = new EthCheatCodesWithState([ETHEREUM_HOST]);
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await client.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

    // make it so the validator will use its peers to bootstrap
    await enableValidatorDynamicBootNode(INSTANCE_NAME, NAMESPACE, SPARTAN_DIR, debugLogger);

    // restart the bot to ensure that it's not affected by the previous test
    await restartBot(NAMESPACE, debugLogger);

    // wait for the chain to build at least 1 epoch's worth of blocks
    // note, don't forget that normally an epoch doesn't need epochDuration worth of blocks,
    // but here we do double duty:
    // we want a handful of blocks, and we want to pass the epoch boundary
    await awaitL2BlockNumber(rollupCheatCodes, epochDuration, 60 * 6, debugLogger);

    let deploymentOutput: string = '';
    deploymentOutput = await applyNetworkShaping({
      valuesFile: 'network-requirements.yaml',
      namespace: NAMESPACE,
      spartanDir: SPARTAN_DIR,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    deploymentOutput = await applyBootNodeFailure({
      durationSeconds: 60 * 60 * 24,
      namespace: NAMESPACE,
      spartanDir: SPARTAN_DIR,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    await restartBot(NAMESPACE, debugLogger);

    const rounds = 3;
    for (let i = 0; i < rounds; i++) {
      debugLogger.info(`Round ${i + 1}/${rounds}`);
      deploymentOutput = await applyValidatorKill({
        namespace: NAMESPACE,
        spartanDir: SPARTAN_DIR,
        logger: debugLogger,
      });
      debugLogger.info(deploymentOutput);
      debugLogger.info(`Waiting for 1 epoch to pass`);
      const controlTips = await rollupCheatCodes.getTips();
      await sleep(Number(epochDuration * slotDuration) * 1000);
      const newTips = await rollupCheatCodes.getTips();

      // calculate the percentage of slots missed for debugging purposes
      const perfectPending = controlTips.pending + BigInt(Math.floor(Number(epochDuration)));
      const missedSlots = Number(perfectPending) - Number(newTips.pending);
      const missedSlotsPercentage = (missedSlots / Number(epochDuration)) * 100;
      debugLogger.info(`Missed ${missedSlots} slots, ${missedSlotsPercentage.toFixed(2)}%`);

      expect(newTips.pending).toBeGreaterThan(controlTips.pending);
    }
  });
});
