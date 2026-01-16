import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import type { ChildProcess } from 'child_process';

import { AlertTriggeredError, GrafanaClient } from '../quality_of_service/grafana_client.js';
import {
  applyProverBrokerKill,
  applyProverKill,
  deleteResourceByLabel,
  getGitProjectRoot,
  setupEnvironment,
  startPortForward,
} from './utils.js';

const config = setupEnvironment(process.env);

const logger = createLogger('e2e:spartan-test:prover-node');

const epochDurationSeconds = config.AZTEC_EPOCH_DURATION * config.AZTEC_SLOT_DURATION;

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
  const forwardProcesses: ChildProcess[] = [];
  let alertChecker: GrafanaClient;
  let spartanDir: string;
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
      if (promPort === 0) {
        p.kill();
      }
    }

    if (promPort === 0) {
      const { process: p, port } = await startPortForward({
        resource: `svc/prometheus-server`,
        namespace: config.NAMESPACE,
        containerPort: 80,
      });
      promProc = p;
      promPort = port;
    }

    if (!promProc || promPort === 0) {
      throw new Error('Unable to port-forward to Prometheus. Ensure the metrics stack is deployed.');
    }

    forwardProcesses.push(promProc);
    const grafanaEndpoint = `http://127.0.0.1:${promPort}/api/v1`;
    const grafanaCredentials = '';
    alertChecker = new GrafanaClient(logger, { grafanaEndpoint, grafanaCredentials });

    spartanDir = `${getGitProjectRoot()}/spartan`;
  });

  afterAll(async () => {
    const cleanup = async (instanceName: string) => {
      const label = `app.kubernetes.io/instance=${instanceName}`;
      await deleteResourceByLabel({ resource: 'podchaos', namespace: config.NAMESPACE, label }).catch(() => undefined);
    };
    await cleanup('prover-kill');
    await cleanup('prover-broker-kill');
    forwardProcesses.forEach(p => p.kill());
  });

  it('should recover after a crash', async () => {
    logger.info(`Waiting for epoch to be partially proven`);

    // use the alert checker to wait until grafana picks up a proof has started
    await retryUntil(
      async () => {
        try {
          await alertChecker.runAlertCheck([enqueuedBlockRollupJobs]);
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

    // wait for the node to start proving again and
    // validate it hits the cache
    const result = await retryUntil(
      async () => {
        try {
          await alertChecker.runAlertCheck([cachedProvingJobs]);
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

    await retryUntil(
      async () => {
        try {
          await alertChecker.runAlertCheck([enqueuedBlockRollupJobs]);
        } catch (err) {
          return err && err instanceof AlertTriggeredError;
        }
      },
      'wait for epoch',
      900,
      5,
    );

    logger.info(`Detected epoch proving job. Killing the broker`);

    await applyProverBrokerKill({
      namespace: config.NAMESPACE,
      spartanDir,
      logger,
      values: { 'global.chaosResourceNamespace': config.NAMESPACE },
    });

    const result = await retryUntil(
      async () => {
        try {
          await alertChecker.runAlertCheck([enqueuedRootRollupJobs]);
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
