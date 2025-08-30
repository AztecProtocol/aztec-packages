// import { retryUntil } from '@aztec/aztec.js';
// import { createLogger } from '@aztec/foundation/log';

// import type { ChildProcess } from 'child_process';

// import { AlertTriggeredError } from '../quality_of_service/alert_checker.js';
// import {
//   applyProverBrokerKill,
//   applyProverKill,
//   isK8sConfig,
//   runAlertCheck,
//   setupEnvironment,
//   startPortForward,
// } from './utils.js';

// const config = setupEnvironment(process.env);
// if (!isK8sConfig(config)) {
//   throw new Error('This test requires running in K8s');
// }

// const logger = createLogger('e2e:spartan-test:prover-node');

// /**
//  * This test aims to check that a prover node is able to recover after a crash.
//  * How do we that? We check what proofs get submitted to the broker when the node comes back online
//  * If everything works as expected, the broker should report a bunch of 'cached' proving jobs.
//  * This would be the prover node coming back online and starting the proving process over.
//  * Because the proving jobs are cached their results will be available immediately.
//  *
//  * We'll wait for an epoch to be partially proven (at least one BLOCK_ROOT_ROLLUP has been submitted) so that the next time the prover starts it'll hit the cache.
//  */
// const interval = '1m';
// const cachedProvingJobs = {
//   alert: 'CachedProvingJobRate',
//   expr: `increase(sum(last_over_time(aztec_proving_queue_cached_jobs_count[${interval}]) or vector(0))[${interval}:])`,
//   labels: { severity: 'error' },
//   for: interval,
//   annotations: {},
// };

// const enqueuedBlockRollupJobs = {
//   alert: 'EnqueuedBlockRootRollup',
//   expr: `rate(aztec_proving_queue_enqueued_jobs_count{aztec_proving_job_type=~"BLOCK_ROOT_ROLLUP|SINGLE_TX_BLOCK_ROOT_ROLLUP"}[${interval}])>0`,
//   labels: { severity: 'error' },
//   for: interval,
//   annotations: {},
// };

// const enqueuedRootRollupJobs = {
//   alert: 'EnqueuedRootRollup',
//   expr: `rate(aztec_proving_queue_enqueued_jobs_count{aztec_proving_job_type="ROOT_ROLLUP"}[${interval}])>0`,
//   labels: { severity: 'error' },
//   for: interval,
//   annotations: {},
// };

// describe('prover node recovery', () => {
//   const forwardProcesses: ChildProcess[] = [];
//   beforeAll(async () => {
//     const { process } = await startPortForward({
//       resource: `svc/metrics-grafana`,
//       namespace: 'metrics',
//       containerPort: config.CONTAINER_METRICS_PORT,
//     });
//     forwardProcesses.push(process);
//   });

//   afterAll(() => {
//     forwardProcesses.forEach(p => p.kill());
//   });

//   it('should recover after a crash', async () => {
//     logger.info(`Waiting for epoch to be partially proven`);

//     // use the alert checker to wait until grafana picks up a proof has started
//     await retryUntil(
//       async () => {
//         try {
//           await runAlertCheck(config, [enqueuedBlockRollupJobs], logger);
//         } catch (err) {
//           return err && err instanceof AlertTriggeredError;
//         }
//       },
//       'wait for proofs',
//       600,
//       5,
//     );

//     logger.info(`Detected partial epoch proven. Killing the prover node`);

//     await applyProverKill({
//       namespace: config.NAMESPACE,
//       spartanDir: config.SPARTAN_DIR,
//       logger,
//     });

//     // wait for the node to start proving again and
//     // validate it hits the cache
//     const result = await retryUntil(
//       async () => {
//         try {
//           await runAlertCheck(config, [cachedProvingJobs], logger);
//         } catch (err) {
//           if (err && err instanceof AlertTriggeredError) {
//             return true;
//           }
//         }
//         return false;
//       },
//       'wait for cached proving jobs',
//       600,
//       5,
//     );

//     expect(result).toBeTrue();
//   }, 1_800_000);

//   it('should recover after a broker crash', async () => {
//     logger.info(`Waiting for epoch proving job to start`);

//     // use the alert checker to wait until grafana picks up a proof has started
//     await retryUntil(
//       async () => {
//         try {
//           await runAlertCheck(config, [enqueuedBlockRollupJobs], logger);
//         } catch {
//           return true;
//         }
//       },
//       'wait for epoch',
//       600,
//       5,
//     );

//     logger.info(`Detected epoch proving job. Killing the broker`);

//     await applyProverBrokerKill({
//       namespace: config.NAMESPACE,
//       spartanDir: config.SPARTAN_DIR,
//       logger,
//     });

//     // wait for the broker to come back online and for proving to continue
//     const result = await retryUntil(
//       async () => {
//         try {
//           await runAlertCheck(config, [enqueuedRootRollupJobs], logger);
//         } catch (err) {
//           if (err && err instanceof AlertTriggeredError) {
//             return true;
//           }
//         }
//         return false;
//       },
//       'wait for root rollup',
//       600,
//       5,
//     );

//     expect(result).toBeTrue();
//   }, 1_800_000);
// });
