import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { AlertTriggeredError } from '../quality_of_service/grafana_client.js';
import {
  ChainHealth,
  type ServiceEndpoint,
  applyProverBrokerKill,
  applyProverKill,
  createResilientPrometheusConnection,
  deleteResourceByLabel,
  getGitProjectRoot,
  getRPCEndpoint,
  setupEnvironment,
  waitForProvenToAdvance,
} from './utils.js';

const config = setupEnvironment(process.env);

const logger = createLogger('e2e:spartan-test:prover-node');

const epochDurationSeconds = config.AZTEC_EPOCH_DURATION * config.AZTEC_SLOT_DURATION;
const slotDurationSeconds = config.AZTEC_SLOT_DURATION;

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
  expr: `sum(rate(aztec_proving_queue_enqueued_jobs_count{k8s_namespace_name="${config.NAMESPACE}",aztec_proving_job_type=~"BLOCK_ROOT_NO_TXS_ROLLUP|CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP"}[${interval}]))>0`,
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

// Tests prover-node crash recovery against a live k8s deployment. Kills the prover broker and prover
// pods via kubectl, then watches Prometheus alert rules to confirm the node comes back online and resumes
// work from the cached proving-job state (BLOCK_ROOT_ROLLUP and ROOT_ROLLUP alerts fire as expected).
describe('prover node recovery', () => {
  const endpoints: ServiceEndpoint[] = [];
  let runAlertCheck: ReturnType<typeof createResilientPrometheusConnection>['runAlertCheck'];
  let spartanDir: string;
  let rpcEndpoint: ServiceEndpoint;
  const health = new ChainHealth(config.NAMESPACE, logger);

  beforeAll(async () => {
    await health.setup();

    rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);

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

    await waitForProvenToAdvance(rpcEndpoint.url, logger, epochDurationSeconds * 3, slotDurationSeconds);

    logger.info(`Proven block advanced. Killing the broker`);

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
