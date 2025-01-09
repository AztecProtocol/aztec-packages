import { retryUntil, sleep } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';

import { type AlertConfig } from '../quality_of_service/alert_checker.js';
import { applyProverKill, isK8sConfig, runAlertCheck, setupEnvironment, startPortForward } from './utils.js';

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
 * The system naturally has some duplicate proving jobs. These are handled automatically by the broker and no work is
 * wasted (e.g. a block wiht no L1 to L2 messages would enqueue four identical empty base parity proofs.)
 *
 * We'll target specifically the base rollup proofs to check that everything works correctly. The base rollups take
 * unique inputs for each txs so jobs will only get cached after crash recovery.
 * We could also use the tube proof for this, but in a simulated network, all tube proof jobs take the same input proof: the empty private kernel proof.
 */
const cachedBaseRollupJobs = {
  alert: 'CachedBaseRollupRate',
  // or (...) captures the initial surge in cached jobs
  expr: `(rate(aztec_proving_queue_cached_jobs{aztec_proving_job_type="PUBLIC_BASE_ROLLUP"}[1m]) or (aztec_proving_queue_cached_jobs{aztec_proving_job_type="PUBLIC_BASE_ROLLUP"} > bool 0)) > 0`,
  labels: { severity: 'error' },
  for: '1m',
  annotations: {},
};

const newBaseRollupJobs: AlertConfig = {
  alert: 'NewBaseRollupJobs',
  expr: `rate(aztec_proving_queue_enqueued_jobs_count{aztec_proving_job_type="PUBLIC_BASE_ROLLUP"}[1m])>0`,
  labels: { severity: 'error' },
  for: '1m',
  annotations: {},
};

describe('prover node recovery', () => {
  beforeAll(async () => {
    await startPortForward({
      resource: `svc/metrics-grafana`,
      namespace: 'metrics',
      containerPort: config.CONTAINER_METRICS_PORT,
      hostPort: config.HOST_METRICS_PORT,
    });
  });

  it('should start proving', async () => {
    logger.info(`Waiting for base rollups to be submitted`);

    // use the alert checker to wait until grafana picks up a proof has started
    await retryUntil(
      async () => {
        try {
          await runAlertCheck(config, [newBaseRollupJobs], logger);
        } catch {
          return true;
        }
      },
      'wait for base rollups',
      600,
      5,
    );

    logger.info(`Detected base rollups. Killing the prover node`);

    await applyProverKill({
      namespace: config.NAMESPACE,
      spartanDir: config.SPARTAN_DIR,
      logger,
    });

    // give the node a chance to come back online
    await sleep(60_000);

    // assert that jobs have been cached
    await expect(runAlertCheck(config, [cachedBaseRollupJobs], logger)).rejects.toBeDefined();
  }, 1_800_000);
});
