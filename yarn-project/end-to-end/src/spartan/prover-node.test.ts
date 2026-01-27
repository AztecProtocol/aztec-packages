import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { AlertTriggeredError, GrafanaClient } from '../quality_of_service/grafana_client.js';
import {
  ChainHealth,
  type ServiceEndpoint,
  applyProverBrokerKill,
  applyProverKill,
  deleteResourceByLabel,
  getGitProjectRoot,
  getRPCEndpoint,
  setupEnvironment,
  startPortForward,
} from './utils.js';

const config = setupEnvironment(process.env);

const logger = createLogger('e2e:spartan-test:prover-node');

const epochDurationSeconds = config.AZTEC_EPOCH_DURATION * config.AZTEC_SLOT_DURATION;
const slotDurationSeconds = config.AZTEC_SLOT_DURATION;

/**
 * Waits until the proven block number increases, indicating an epoch proof was just submitted.
 * This ensures we're at the START of a new epoch proving cycle, giving maximum time
 * for the broker to restart and the prover to complete the next epoch.
 *
 * This prevents killing the broker in the middle of proving an epoch (which takes ~20 min),
 * which would cause the epoch to not be proven in time and trigger chain pruning.
 */
async function waitForProvenToAdvance(rpcUrl: string, log: typeof logger, timeoutSeconds: number = 300): Promise<void> {
  const node = createAztecNodeClient(rpcUrl);

  log.info('Waiting for proven block to advance (indicating epoch proof just submitted)...');

  // Get current proven block number
  let initialProvenBlock: number;
  try {
    const tips = await node.getL2Tips();
    initialProvenBlock = Number(tips.proven.block.number);
    log.info(`Current proven block: ${initialProvenBlock}. Waiting for it to increase...`);
  } catch (err) {
    log.warn(`Error getting initial tips: ${err}. Will poll until successful.`);
    initialProvenBlock = 0;
  }

  await retryUntil(
    async () => {
      try {
        const tips = await node.getL2Tips();
        const currentProvenBlock = Number(tips.proven.block.number);
        const proposedBlock = Number(tips.proposed.number);

        log.verbose(
          `Chain state: proposed=${proposedBlock}, proven=${currentProvenBlock} (waiting for > ${initialProvenBlock})`,
        );

        if (currentProvenBlock > initialProvenBlock) {
          log.info(`Proven block advanced from ${initialProvenBlock} to ${currentProvenBlock}. Safe to kill broker.`);
          return true;
        }

        return false;
      } catch (err) {
        log.verbose(`Error checking tips: ${err}`);
        return false;
      }
    },
    'proven block to advance',
    timeoutSeconds,
    slotDurationSeconds, // Check every slot
  );
}

/**
 * Creates a Prometheus connection that can re-establish port-forward on failure.
 * Returns a function to run alert checks that automatically reconnects if needed.
 */
function createResilientPrometheusConnection(namespace: string, endpoints: ServiceEndpoint[], log: typeof logger) {
  let alertChecker: GrafanaClient | undefined;
  let currentEndpoint: ServiceEndpoint | undefined;

  const connect = async (): Promise<GrafanaClient> => {
    // Kill existing connection if any
    if (currentEndpoint?.process) {
      currentEndpoint.process.kill();
    }

    // Try metrics namespace first, then network namespace
    let promPort = 0;
    let promUrl = '';
    let promProc: Awaited<ReturnType<typeof startPortForward>>['process'];

    const metricsResult = await startPortForward({
      resource: `svc/metrics-prometheus-server`,
      namespace: 'metrics',
      containerPort: 80,
    });
    promProc = metricsResult.process;
    promPort = metricsResult.port;
    promUrl = `http://127.0.0.1:${promPort}/api/v1`;
    if (promPort === 0) {
      metricsResult.process.kill();

      const nsResult = await startPortForward({
        resource: `svc/prometheus-server`,
        namespace,
        containerPort: 80,
      });
      promProc = nsResult.process;
      promPort = nsResult.port;
      promUrl = `http://127.0.0.1:${promPort}/api/v1`;
    }

    if (!promProc || promPort === 0) {
      throw new Error('Unable to port-forward to Prometheus');
    }

    currentEndpoint = { url: promUrl, process: promProc };
    endpoints.push(currentEndpoint);
    alertChecker = new GrafanaClient(log, { grafanaEndpoint: promUrl, grafanaCredentials: '' });
    log.info(`Established Prometheus connection at ${promUrl}`);
    return alertChecker;
  };

  const runAlertCheck = async (alerts: Parameters<GrafanaClient['runAlertCheck']>[0]): Promise<void> => {
    if (!alertChecker) {
      alertChecker = await connect();
    }

    try {
      await alertChecker.runAlertCheck(alerts);
    } catch (err) {
      // If it's an AlertTriggeredError, that's expected behavior - rethrow
      if (err instanceof AlertTriggeredError) {
        throw err;
      }

      // Check if it's a connection error (port-forward died)
      const errorStr = String(err);
      if (errorStr.includes('fetch failed') || errorStr.includes('ECONNREFUSED') || errorStr.includes('ECONNRESET')) {
        log.warn(`Prometheus connection lost, re-establishing port-forward...`);
        alertChecker = await connect();
        // Retry once with new connection
        await alertChecker.runAlertCheck(alerts);
      } else {
        throw err;
      }
    }
  };

  return { connect, runAlertCheck };
}

/**
 * This test aims to check that a prover node is able to recover after a crash.
 * How do we that? We check what proofs get submitted to the broker when the node comes back online
 * If everything works as expected, the broker should report a bunch of 'cached' proving jobs.
 * This would be the prover node coming back online and starting the proving process over.
 * Because the proving jobs are cached their results will be available immediately.
 *
 * We'll wait for an epoch to be partially proven (at least one BLOCK_ROOT_ROLLUP has been submitted) so that the next time the prover starts it'll hit the cache.
 */
const interval = '5m';
const cachedProvingJobs = {
  alert: 'CachedProvingJobRate',
  expr: `sum(increase(aztec_proving_queue_resolved_jobs_count{k8s_namespace_name="${config.NAMESPACE}"}[${interval}]))>0`,
  labels: { severity: 'error' },
  for: interval,
  annotations: {},
};

const enqueuedBlockRollupJobs = {
  alert: 'EnqueuedBlockRootRollup',
  expr: `sum(rate(aztec_proving_queue_enqueued_jobs_count{k8s_namespace_name="${config.NAMESPACE}",aztec_proving_job_type=~"BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP|CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP"}[${interval}]))>0`,
  labels: { severity: 'error' },
  for: interval,
  annotations: {},
};

const enqueuedRootRollupJobs = {
  alert: 'EnqueuedRootRollup',
  expr: `sum(rate(aztec_proving_queue_enqueued_jobs_count{k8s_namespace_name="${config.NAMESPACE}",aztec_proving_job_type="ROOT_ROLLUP"}[${interval}]))>0`,
  labels: { severity: 'error' },
  for: interval,
  annotations: {},
};

describe('prover node recovery', () => {
  const endpoints: ServiceEndpoint[] = [];
  let runAlertCheck: ReturnType<typeof createResilientPrometheusConnection>['runAlertCheck'];
  let spartanDir: string;
  let rpcEndpoint: ServiceEndpoint;
  const health = new ChainHealth(config.NAMESPACE, logger);

  beforeAll(async () => {
    await health.setup();

    // Get RPC endpoint for chain state queries
    rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);

    // Create resilient Prometheus connection that auto-reconnects on port-forward failure
    const prometheus = createResilientPrometheusConnection(config.NAMESPACE, endpoints, logger);
    await prometheus.connect();
    runAlertCheck = prometheus.runAlertCheck;

    spartanDir = `${getGitProjectRoot()}/spartan`;
  });

  afterAll(async () => {
    await health.teardown();
    const cleanup = async (instanceName: string) => {
      const label = `app.kubernetes.io/instance=${instanceName}`;
      await deleteResourceByLabel({ resource: 'podchaos', namespace: config.NAMESPACE, label }).catch(() => undefined);
    };
    await cleanup('prover-kill');
    await cleanup('prover-broker-kill');
    endpoints.forEach(e => e.process?.kill());
  });

  it('should recover after a crash', async () => {
    logger.info(`Waiting for epoch to be partially proven`);

    // use the alert checker to wait until grafana picks up a proof has started
    await retryUntil(
      async () => {
        try {
          await runAlertCheck([enqueuedBlockRollupJobs]);
        } catch (err) {
          return err && err instanceof AlertTriggeredError;
        }
      },
      'wait for proofs',
      900,
      5,
    );

    logger.info(`Detected partial epoch proven. Killing the prover node`);

    await applyProverKill({
      namespace: config.NAMESPACE,
      spartanDir,
      logger,
      values: { 'global.chaosResourceNamespace': config.NAMESPACE },
    });

    // Wait for the node to start proving again and validate it hits the cache
    const result = await retryUntil(
      async () => {
        try {
          await runAlertCheck([cachedProvingJobs]);
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
    logger.info(`Waiting for epoch proving job to start`);

    // First, wait for proving to be active
    await retryUntil(
      async () => {
        try {
          await runAlertCheck([enqueuedBlockRollupJobs]);
        } catch (err) {
          return err && err instanceof AlertTriggeredError;
        }
      },
      'wait for epoch',
      900,
      5,
    );

    logger.info(`Detected epoch proving job. Waiting for proven block to advance...`);

    await waitForProvenToAdvance(rpcEndpoint.url, logger, epochDurationSeconds * 3);

    logger.info(`Proven block advanced - safe to kill broker. Killing the broker`);

    await applyProverBrokerKill({
      namespace: config.NAMESPACE,
      spartanDir,
      logger,
      values: { 'global.chaosResourceNamespace': config.NAMESPACE },
    });

    // Wait for the broker to recover and proving to resume
    const result = await retryUntil(
      async () => {
        try {
          await runAlertCheck([enqueuedRootRollupJobs]);
        } catch (err) {
          if (err && err instanceof AlertTriggeredError) {
            return true;
          }
        }
        return false;
      },
      'wait for root rollup',
      epochDurationSeconds * 3,
      5,
    );

    expect(result).toBeTrue();
  }, 3_600_000);
});
