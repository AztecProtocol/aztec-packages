import { createAztecNodeClient } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import {
  applyBootNodeFailure,
  applyNetworkShaping,
  applyValidatorKill,
  awaitL2BlockNumber,
  getGitProjectRoot,
  installTransferBot,
  restartBot,
  setupEnvironment,
  startPortForward,
  startPortForwardForEthereum,
  startPortForwardForRPC,
  uninstallTransferBot,
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
const { NAMESPACE } = config;
const debugLogger = createLogger('e2e:spartan-test:gating-passive');

describe('a test that passively observes the network in the presence of network chaos', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  let ETHEREUM_HOST: string;
  let alertChecker: AlertChecker;
  let spartanDir: string;
  const forwardProcesses: ChildProcess[] = [];

  beforeAll(async () => {
    // Try Prometheus in a dedicated metrics namespace first; if not present, fall back to the network namespace
    let promPort = 0;
    let promProc: ChildProcess | undefined;
    {
      const { process: p, port } = await startPortForward({
        resource: `svc/metrics-prometheus-server`,
        namespace: 'metrics',
        containerPort: 80,
      });
      promProc = p;
      promPort = port;
      if (promPort === 0 && p) {
        p.kill();
      }
    }

    if (promPort === 0) {
      // Fall back to Prometheus in the same namespace (service name: prometheus-server on port 80)
      const { process: p, port } = await startPortForward({
        resource: `svc/prometheus-server`,
        namespace: NAMESPACE,
        containerPort: 80,
      });
      promProc = p;
      promPort = port;
    }

    if (promProc && promPort !== 0) {
      forwardProcesses.push(promProc);
      const grafanaEndpoint = `http://127.0.0.1:${promPort}/api/v1`;
      const grafanaCredentials = '';
      alertChecker = new AlertChecker(debugLogger, { grafanaEndpoint, grafanaCredentials });
    } else {
      debugLogger.warn('Prometheus not reachable; skipping QoS alert checks for this run.');
    }

    spartanDir = `${getGitProjectRoot()}/spartan`;

    // Ensure the transfer bot is enabled for this test only
    await installTransferBot({
      namespace: NAMESPACE,
      spartanDir,
      logger: debugLogger,
      replicas: 1,
      txIntervalSeconds: 10,
      followChain: 'PENDING',
    });
  });

  afterAll(async () => {
    if (alertChecker) {
      await alertChecker.runAlertCheck(qosAlerts);
    }
    // Teardown transfer bot installed for this test
    await uninstallTransferBot(NAMESPACE, debugLogger);
    forwardProcesses.forEach(p => p.kill());
  });

  it('survives network chaos', async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const nodeUrl = `http://127.0.0.1:${aztecRpcPort}`;

    const { process: ethProcess, port: ethPort } = await startPortForwardForEthereum(NAMESPACE);
    forwardProcesses.push(ethProcess);
    ETHEREUM_HOST = `http://127.0.0.1:${ethPort}`;

    const node = createAztecNodeClient(nodeUrl);
    const ethCheatCodes = new EthCheatCodesWithState([ETHEREUM_HOST], new DateProvider());
    const rollupCheatCodes = new RollupCheatCodes(
      ethCheatCodes,
      await node.getNodeInfo().then(n => n.l1ContractAddresses),
    );
    const { epochDuration, slotDuration } = await rollupCheatCodes.getConfig();

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
      spartanDir,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    deploymentOutput = await applyBootNodeFailure({
      durationSeconds: 60 * 60 * 24,
      namespace: NAMESPACE,
      spartanDir,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    await restartBot(NAMESPACE, debugLogger);

    const rounds = 3;
    for (let i = 0; i < rounds; i++) {
      debugLogger.info(`Round ${i + 1}/${rounds}`);
      deploymentOutput = await applyValidatorKill({
        namespace: NAMESPACE,
        spartanDir,
        logger: debugLogger,
      });
      debugLogger.info(deploymentOutput);
      debugLogger.info(`Waiting for chain to progress by at least 1 block`);
      const controlTips = await rollupCheatCodes.getTips();
      const timeoutSeconds = Math.ceil(Number(epochDuration * slotDuration) * 2);
      await awaitL2BlockNumber(rollupCheatCodes, controlTips.pending + 1n, timeoutSeconds, debugLogger);
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
