import { type PXE, RollupCheatCodes, createPXEClient, retryUntil } from '@aztec/aztec.js';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';

import { AlertTriggeredError } from '../quality_of_service/alert_checker.js';
import {
  applyProverBrokerKill,
  applyProverKill,
  awaitProvenChainAdvance,
  isK8sConfig,
  runAlertCheck,
  setupEnvironment,
  startPortForward,
} from './utils.js';

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test requires running in K8s');
}

const logger = createLogger('e2e:spartan-test:prover-node');

/**
 * This test aims to check that a prover node is able to recover after a crash.
 * How do we that? We check what proofs get submitted to the broker when the node comes back online
 * If everything works as expected, the broker should report a bunch of 'cached' proving jobs.
 * This would be the prover node coming back online and starting the proving process over.
 * Because the proving jobs are cached their results will be available immediately.
 *
 * We'll wait for an epoch to be partially proven (at least one BLOCK_ROOT_ROLLUP has been submitted) so that the next time the prover starts it'll hit the cache.
 */
const interval = '1m';
const cachedProvingJobs = {
  alert: 'CachedProvingJobRate',
  expr: `increase(sum(last_over_time(aztec_proving_queue_cached_jobs_count[${interval}]) or vector(0))[${interval}:])`,
  labels: { severity: 'error' },
  for: interval,
  annotations: {},
};

const completedProvingJobs = {
  alert: 'ResolvedProvingJobRate',
  expr: `rate(aztec_proving_queue_enqueued_jobs_count{aztec_proving_job_type=~"BLOCK_ROOT_ROLLUP|SINGLE_TX_BLOCK_ROOT_ROLLUP"}[${interval}])>0`,
  labels: { severity: 'error' },
  for: interval,
  annotations: {},
};

describe('prover node recovery', () => {
  let PXE_URL: string;
  let ETHEREUM_HOST: string;
  let pxe: PXE;
  beforeAll(async () => {
    await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_PXE_PORT,
      hostPort: config.HOST_PXE_PORT,
    });
    await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-ethereum`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_ETHEREUM_PORT,
      hostPort: config.HOST_ETHEREUM_PORT,
    });
    PXE_URL = `http://127.0.0.1:${config.HOST_PXE_PORT}`;
    ETHEREUM_HOST = `http://127.0.0.1:${config.HOST_ETHEREUM_PORT}`;
    await startPortForward({
      resource: `svc/metrics-grafana`,
      namespace: 'metrics',
      containerPort: config.CONTAINER_METRICS_PORT,
      hostPort: config.HOST_METRICS_PORT,
    });

    pxe = createPXEClient(PXE_URL);
  });

  it('should recover after a crash', async () => {
    logger.info(`Waiting for epoch to be partially proven`);

    // use the alert checker to wait until grafana picks up a proof has started
    await retryUntil(
      async () => {
        try {
          await runAlertCheck(config, [completedProvingJobs], logger);
        } catch (err) {
          return err && err instanceof AlertTriggeredError;
        }
      },
      'wait for proofs',
      600,
      5,
    );

    logger.info(`Detected partial epoch proven. Killing the prover node`);

    await applyProverKill({
      namespace: config.NAMESPACE,
      spartanDir: config.SPARTAN_DIR,
      logger,
    });

    // wait for the node to start proving again and
    // validate it hits the cache
    const result = await retryUntil(
      async () => {
        try {
          await runAlertCheck(config, [cachedProvingJobs], logger);
        } catch (err) {
          if (err && err instanceof AlertTriggeredError) {
            return true;
          }
        }
        return false;
      },
      'wait for cached proving jobs',
      600,
      5,
    );

    expect(result).toBeTrue();
  }, 1_800_000);

  it('should recover after a broker crash', async () => {
    logger.info(`Waiting for base rollups to be submitted`);

    // use the alert checker to wait until grafana picks up a proof has started
    await retryUntil(
      async () => {
        try {
          await runAlertCheck(config, [completedProvingJobs], logger);
        } catch {
          return true;
        }
      },
      'wait for base rollups',
      600,
      5,
    );

    logger.info(`Detected base rollups. Killing the broker`);

    await applyProverBrokerKill({
      namespace: config.NAMESPACE,
      spartanDir: config.SPARTAN_DIR,
      logger,
    });

    const rollupCheatCodes = new RollupCheatCodes(
      new EthCheatCodesWithState(ETHEREUM_HOST),
      await pxe.getNodeInfo().then(n => n.l1ContractAddresses),
    );

    await expect(awaitProvenChainAdvance(rollupCheatCodes, 1800, logger)).resolves.toEqual(true);
  });
});
