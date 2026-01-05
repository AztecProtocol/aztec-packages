import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { expect, jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import {
  applyBootNodeFailure,
  applyNetworkShaping,
  applyValidatorKill,
  awaitCheckpointNumber,
  deleteResourceByLabel,
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
  const podChaosInstances: string[] = [];
  const networkShapingInstance = `${NAMESPACE}-network-shaping`;

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

    // Teardown chaos experiments created during the test
    for (const instanceName of podChaosInstances) {
      const label = `app.kubernetes.io/instance=${instanceName}`;
      await deleteResourceByLabel({ resource: 'podchaos', namespace: NAMESPACE, label }).catch(() => undefined);
    }
    const label = `app.kubernetes.io/instance=${networkShapingInstance}`;
    await deleteResourceByLabel({ resource: 'workflows', namespace: NAMESPACE, label }).catch(() => undefined);

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

    // wait for the chain to build at least 1 epoch's worth of checkpoints
    // note, don't forget that normally an epoch doesn't need epochDuration worth of checkpoints,
    // but here we do double duty:
    // we want a handful of checkpoints, and we want to pass the epoch boundary
    const initialTips = await rollupCheatCodes.getTips();
    const checkpointWaitTarget = CheckpointNumber(initialTips.pending + Number(epochDuration));
    const epochDurationSeconds = Number(BigInt(epochDuration) * BigInt(slotDuration));
    await awaitCheckpointNumber(rollupCheatCodes, checkpointWaitTarget, epochDurationSeconds * 2, debugLogger);

    let deploymentOutput: string = '';
    deploymentOutput = await applyNetworkShaping({
      instanceName: `${NAMESPACE}-network-shaping`,
      valuesFile: 'network-requirements.yaml',
      namespace: NAMESPACE,
      spartanDir,
      logger: debugLogger,
    });
    debugLogger.info(deploymentOutput);
    const bootNodeFailureInstance = `${NAMESPACE}-boot-node-failure`;
    podChaosInstances.push(bootNodeFailureInstance);
    deploymentOutput = await applyBootNodeFailure({
      instanceName: bootNodeFailureInstance,
      durationSeconds: 60 * 60 * 24,
      namespace: NAMESPACE,
      spartanDir,
      logger: debugLogger,
      values: { 'global.chaosResourceNamespace': NAMESPACE },
    });
    debugLogger.info(deploymentOutput);
    await restartBot(NAMESPACE, debugLogger);

    const rounds = 3;
    for (let i = 0; i < rounds; i++) {
      debugLogger.info(`Round ${i + 1}/${rounds}`);
      const validatorKillInstance = `${NAMESPACE}-validator-kill-${i + 1}`;
      podChaosInstances.push(validatorKillInstance);
      deploymentOutput = await applyValidatorKill({
        instanceName: validatorKillInstance,
        namespace: NAMESPACE,
        spartanDir,
        logger: debugLogger,
        values: { 'global.chaosResourceNamespace': NAMESPACE },
      });
      debugLogger.info(deploymentOutput);
      debugLogger.info(`Waiting for chain to progress by at least 1 checkpoint`);
      const controlTips = await rollupCheatCodes.getTips();
      const timeoutSeconds = Math.ceil(Number(BigInt(epochDuration) * BigInt(slotDuration)) * 2);
      await awaitCheckpointNumber(
        rollupCheatCodes,
        CheckpointNumber(controlTips.pending + 1),
        timeoutSeconds,
        debugLogger,
      );
      const newTips = await rollupCheatCodes.getTips();

      // calculate the percentage of slots missed for debugging purposes
      const perfectPending = CheckpointNumber(controlTips.pending + Math.floor(Number(epochDuration)));
      const missedSlots = perfectPending - newTips.pending;
      const missedSlotsPercentage = (missedSlots / Number(epochDuration)) * 100;
      debugLogger.info(`Missed ${missedSlots} slots, ${missedSlotsPercentage.toFixed(2)}%`);

      expect(newTips.pending).toBeGreaterThan(controlTips.pending);
    }
  });
});
