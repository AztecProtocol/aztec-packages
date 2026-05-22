import { createLogger } from '@aztec/aztec.js/log';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { makeBackoff, retry, retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import {
  type AztecNodeAdmin,
  type AztecNodeAdminConfig,
  createAztecNodeAdminClient,
} from '@aztec/stdlib/interfaces/client';

import { exec } from 'child_process';
import { promisify } from 'util';

import type { TestConfig } from './config.js';
import { execHelmCommand } from './helm.js';
import {
  deleteResourceByLabel,
  getChartDir,
  startPortForward,
  waitForResourceByLabel,
  waitForResourceByName,
  waitForStatefulSetsReady,
} from './k8s.js';

const execAsync = promisify(exec);

const logger = createLogger('e2e:k8s-utils');

export async function awaitCheckpointNumber(
  rollupCheatCodes: RollupCheatCodes,
  checkpointNumber: CheckpointNumber,
  timeoutSeconds: number,
  log: Logger,
) {
  log.info(`Waiting for checkpoint ${checkpointNumber}`);
  let tips = await rollupCheatCodes.getTips();
  const endTime = Date.now() + timeoutSeconds * 1000;
  while (tips.pending < checkpointNumber && Date.now() < endTime) {
    log.info(`At checkpoint ${tips.pending}`);
    await sleep(1000);
    tips = await rollupCheatCodes.getTips();
  }
  if (tips.pending < checkpointNumber) {
    throw new Error(`Timeout waiting for checkpoint ${checkpointNumber}, only reached ${tips.pending}`);
  } else {
    log.info(`Reached checkpoint ${tips.pending}`);
  }
}

/**
 * Waits until the proven block number increases.
 *
 * @param rpcUrl - URL of an Aztec RPC node to query
 * @param log - Logger instance
 * @param timeoutSeconds - Maximum time to wait
 * @param pollIntervalSeconds - How often to check
 */
export async function waitForProvenToAdvance(
  rpcUrl: string,
  log: Logger,
  timeoutSeconds: number = 300,
  pollIntervalSeconds: number = 12, // slot duration
): Promise<void> {
  const node = createAztecNodeClient(rpcUrl);

  log.info('Waiting for proven block to advance (indicating epoch proof just submitted)...');

  // Get current proven block number
  let initialProvenBlock: number;
  try {
    const tips = await node.getChainTips();
    initialProvenBlock = Number(tips.proven.block.number);
    log.info(`Current proven block: ${initialProvenBlock}. Waiting for it to increase...`);
  } catch (err) {
    log.warn(`Error getting initial tips: ${err}. Will poll until successful.`);
    initialProvenBlock = 0;
  }

  await retryUntil(
    async () => {
      try {
        const tips = await node.getChainTips();
        const currentProvenBlock = Number(tips.proven.block.number);
        const proposedBlock = Number(tips.proposed.number);

        log.verbose(
          `Chain state: proposed=${proposedBlock}, proven=${currentProvenBlock} (waiting for > ${initialProvenBlock})`,
        );

        if (currentProvenBlock > initialProvenBlock) {
          log.info(`Proven block advanced from ${initialProvenBlock} to ${currentProvenBlock}.`);
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
    pollIntervalSeconds,
  );
}

export async function getSequencers(namespace: string) {
  const selectors = [
    'app.kubernetes.io/name=validator',
    'app.kubernetes.io/component=validator',
    'app.kubernetes.io/component=sequencer-node',
    'app=validator',
  ];
  for (const selector of selectors) {
    try {
      const command = `kubectl get pods -l ${selector} -n ${namespace} -o jsonpath='{.items[*].metadata.name}'`;
      const { stdout } = await execAsync(command);
      const sequencers = stdout
        .split(' ')
        .map(s => s.trim())
        .filter(Boolean);
      if (sequencers.length > 0) {
        logger.verbose(`Found sequencer pods ${sequencers.join(', ')} (selector=${selector})`);
        return sequencers;
      }
    } catch {
      // try next selector
    }
  }

  // Fail fast instead of returning [''] which leads to attempts to port-forward `pod/`.
  throw new Error(
    `No sequencer/validator pods found in namespace ${namespace}. Tried selectors: ${selectors.join(', ')}`,
  );
}

export function updateSequencersConfig(env: TestConfig, config: Partial<AztecNodeAdminConfig>) {
  return withSequencersAdmin(env, async client => {
    await client.setConfig(config);
    return client.getConfig();
  });
}

export function getSequencersConfig(env: TestConfig) {
  return withSequencersAdmin(env, client => client.getConfig());
}

export async function withSequencersAdmin<T>(env: TestConfig, fn: (node: AztecNodeAdmin) => Promise<T>): Promise<T[]> {
  const adminContainerPort = 8880;
  const namespace = env.NAMESPACE;
  const sequencers = await getSequencers(namespace);
  const results = [];

  for (const sequencer of sequencers) {
    // Ensure pod is Ready before attempting port-forward.
    await waitForResourceByName({ resource: 'pods', name: sequencer, namespace });
    // Wrap port-forward + fetch in a retry to handle flaky port-forwards
    const result = await retry(
      async () => {
        const { process, port } = await startPortForward({
          resource: `pod/${sequencer}`,
          namespace,
          containerPort: adminContainerPort,
        });

        try {
          const url = `http://localhost:${port}`;
          // Quick health check before using the connection
          const statusRes = await fetch(`${url}/status`);
          if (statusRes.status !== 200) {
            throw new Error(`Admin endpoint returned status ${statusRes.status}`);
          }
          const client = createAztecNodeAdminClient(url, {}, undefined, env.AZTEC_ADMIN_API_KEY);
          return { result: await fn(client), process };
        } catch (err) {
          // Kill the port-forward before retrying
          process.kill();
          throw err;
        }
      },
      'connect to node admin',
      makeBackoff([1, 2, 4, 8]),
      logger,
      true,
    );

    results.push(result.result);
    result.process.kill();
  }

  return results;
}

async function getAztecImageForMigrations(namespace: string): Promise<string> {
  const aztecDockerImage = process.env.AZTEC_DOCKER_IMAGE;
  if (aztecDockerImage) {
    return aztecDockerImage;
  }

  const { stdout } = await execAsync(
    `kubectl get pods -l app.kubernetes.io/name=validator -n ${namespace} -o jsonpath='{.items[0].spec.containers[?(@.name=="aztec")].image}' | cat`,
  );
  const image = stdout.trim().replace(/^'|'$/g, '');
  if (!image) {
    throw new Error(`Could not detect aztec image from validator pod in namespace ${namespace}`);
  }
  return image;
}

async function getHaDbConnectionUrl(namespace: string): Promise<string> {
  const secretName = `${namespace}-validator-ha-db-postgres`;
  const { stdout } = await execAsync(`kubectl get secret ${secretName} -n ${namespace} -o json`);
  const secret = JSON.parse(stdout);
  const data = secret?.data ?? {};
  const decode = (value?: string) => (value ? Buffer.from(value, 'base64').toString('utf8') : '');
  const user = decode(data.POSTGRES_USER);
  const password = decode(data.POSTGRES_PASSWORD);
  const database = decode(data.POSTGRES_DB);
  if (!user || !password || !database) {
    throw new Error(`Missing HA DB credentials in secret ${secretName}`);
  }
  const host = `${namespace}-validator-ha-db-postgres.${namespace}.svc.cluster.local`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${database}`;
}

export async function initHADb(namespace: string): Promise<void> {
  const databaseUrl = await getHaDbConnectionUrl(namespace);
  const image = await getAztecImageForMigrations(namespace);
  const jobName = `${namespace}-validator-ha-db-migrate`;
  await execAsync(`kubectl delete pod ${jobName} -n ${namespace} --ignore-not-found=true`).catch(() => undefined);

  const migrateCmd = [
    `kubectl run ${jobName} -n ${namespace}`,
    '--rm -i',
    '--restart=Never',
    `--image=${image}`,
    `--env=DATABASE_URL=${databaseUrl}`,
    '--command -- node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js migrate-ha-db up',
  ].join(' ');
  const migrateCmdForLog = migrateCmd.replace(/--env=DATABASE_URL=\S+/, '--env=DATABASE_URL=<redacted>');

  await retry(
    async () => {
      logger.info(`command: ${migrateCmdForLog}`);
      await execAsync(migrateCmd);
    },
    'run HA DB migrations',
    makeBackoff([1, 2, 4, 8, 16]),
    logger,
    true,
  );
}

/**
 * Sets probabilistic transaction dropping on validators and waits for rollout.
 * Use probability=0 to disable. Wired to env var P2P_DROP_TX_CHANCE via Helm values.
 */
export async function setValidatorTxDrop({
  namespace,
  probability,
  logger: log,
}: {
  namespace: string;
  probability: number;
  logger: Logger;
}) {
  const prob = String(probability);

  const selectors = ['app.kubernetes.io/name=validator', 'app.kubernetes.io/component=validator', 'app=validator'];
  let updated = false;
  for (const selector of selectors) {
    try {
      const list = await execAsync(`kubectl get statefulset -l ${selector} -n ${namespace} --no-headers -o name | cat`);
      const names = list.stdout
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      if (names.length === 0) {
        continue;
      }
      const cmd = `kubectl set env statefulset -l ${selector} -n ${namespace} P2P_DROP_TX_CHANCE=${prob}`;
      log.info(`command: ${cmd}`);
      await execAsync(cmd);
      updated = true;
    } catch (e) {
      log.warn(`Failed to update validators with selector ${selector}: ${String(e)}`);
    }
  }

  if (!updated) {
    log.warn(`No validator StatefulSets found in ${namespace}. Skipping tx drop toggle.`);
    return;
  }

  // Restart validator pods to ensure env vars take effect and wait for readiness
  await restartValidators(namespace, log);
}

export async function restartValidators(namespace: string, log: Logger) {
  const selectors = ['app.kubernetes.io/name=validator', 'app.kubernetes.io/component=validator', 'app=validator'];
  let any = false;
  for (const selector of selectors) {
    try {
      const { stdout } = await execAsync(`kubectl get pods -l ${selector} -n ${namespace} --no-headers -o name | cat`);
      if (!stdout || stdout.trim().length === 0) {
        continue;
      }
      any = true;
      await deleteResourceByLabel({ resource: 'pods', namespace, label: selector });
    } catch (e) {
      log.warn(`Error restarting validator pods with selector ${selector}: ${String(e)}`);
    }
  }

  if (!any) {
    log.warn(`No validator pods found to restart in ${namespace}.`);
    return;
  }

  // Wait for either label to be Ready
  for (const selector of selectors) {
    try {
      await waitForResourceByLabel({ resource: 'pods', namespace, label: selector });
      return;
    } catch {
      // try next
    }
  }
  log.warn(`Validator pods did not report Ready; continuing.`);
}

export async function enableValidatorDynamicBootNode(
  instanceName: string,
  namespace: string,
  spartanDir: string,
  log: Logger,
) {
  log.info(`Enabling validator dynamic boot node`);
  await execHelmCommand({
    instanceName,
    namespace,
    helmChartDir: getChartDir(spartanDir, 'aztec-network'),
    values: {
      'validator.dynamicBootNode': 'true',
    },
    valuesFile: undefined,
    timeout: '15m',
    reuseValues: true,
  });

  log.info(`Validator dynamic boot node enabled`);
}

/**
 * Rolls the Aztec pods in the given namespace.
 * @param namespace - The namespace to roll the Aztec pods in.
 * @param clearState - If true, also deletes the underlying PVCs to clear persistent storage.
 *        This is required for rollup upgrades where the old state is incompatible with the new rollup.
 *        Defaults to false, which preserves the existing storage.
 */
export async function rollAztecPods(namespace: string, clearState: boolean = false) {
  // Pod components use 'validator', but StatefulSets and PVCs use 'sequencer-node' for validators
  // RPC nodes have nodeType='rpc-node' in Helm values, so their component label is 'rpc-node' (not 'rpc')
  const podComponents = [
    'p2p-bootstrap',
    'prover-node',
    'prover-broker',
    'prover-agent',
    'sequencer-node',
    'rpc-node',
    'validator-ha-db',
  ];
  const pvcComponents = [
    'p2p-bootstrap',
    'prover-node',
    'prover-broker',
    'sequencer-node',
    'rpc-node',
    'validator-ha-db',
  ];
  // StatefulSet components that need to be scaled down before PVC deletion
  // Note: validators use 'sequencer-node' as component label, not 'validator'
  const statefulSetComponents = [
    'p2p-bootstrap',
    'prover-node',
    'prover-broker',
    'sequencer-node',
    'rpc-node',
    'validator-ha-db',
  ];

  if (clearState) {
    // To delete PVCs, we must first scale down StatefulSets so pods release the volumes
    // Otherwise PVC deletion will hang waiting for pods to terminate

    // Save original replica counts for all StatefulSets
    const originalReplicas: Map<string, number> = new Map();
    for (const component of statefulSetComponents) {
      try {
        // Get all StatefulSets that match the component label
        const getCmd = `kubectl get statefulset -l app.kubernetes.io/component=${component} -n ${namespace} -o json`;
        const { stdout } = await execAsync(getCmd);
        const result = JSON.parse(stdout);
        for (const sts of result.items || []) {
          const name = sts.metadata.name;
          const replicas = sts.spec.replicas ?? 1;
          if (replicas > 0) {
            originalReplicas.set(name, replicas);
            logger.debug(`Saved replica count for StatefulSet ${name}: ${replicas}`);
          }
        }
      } catch {
        // Component might not exist, continue
      }
    }

    // Scale down to 0
    for (const component of statefulSetComponents) {
      try {
        const scaleCmd = `kubectl scale statefulset -l app.kubernetes.io/component=${component} -n ${namespace} --replicas=0 --timeout=2m`;
        logger.info(`command: ${scaleCmd}`);
        await execAsync(scaleCmd);
      } catch (e) {
        // Component might not exist or might be a Deployment, continue
        logger.verbose(`Scale down ${component} skipped: ${e}`);
      }
    }

    // Wait for all pods to fully terminate before deleting PVCs.
    // terminationGracePeriodSeconds default is 30s.
    logger.info('Waiting for pods to fully terminate before deleting PVCs...');
    for (const component of statefulSetComponents) {
      try {
        // Wait for all pods with this component label to be deleted
        const waitCmd = `kubectl wait pods -l app.kubernetes.io/component=${component} --for=delete -n ${namespace} --timeout=2m`;
        logger.info(`command: ${waitCmd}`);
        await execAsync(waitCmd);
      } catch (e) {
        logger.verbose(`Wait for pod deletion ${component} skipped: ${e}`);
      }
    }
    // Extra buffer to ensure PVC protection finalizers are cleared
    await sleep(5 * 1000);

    // Now delete PVCs (they should no longer be in use)
    for (const component of pvcComponents) {
      try {
        await deleteResourceByLabel({
          resource: 'persistentvolumeclaims',
          namespace: namespace,
          label: `app.kubernetes.io/component=${component}`,
        });
      } catch (e) {
        logger.warn(`Failed to delete PVCs for ${component}: ${e}`);
      }
    }

    // Verify PVCs are deleted
    for (const component of pvcComponents) {
      try {
        const waitCmd = `kubectl wait pvc -l app.kubernetes.io/component=${component} --for=delete -n ${namespace} --timeout=2m`;
        logger.info(`command: ${waitCmd}`);
        await execAsync(waitCmd);
      } catch (e) {
        logger.verbose(`Wait for PVC deletion ${component} skipped: ${e}`);
      }
    }

    const haDbStatefulSets = [...originalReplicas.entries()].filter(([name]) => name.includes('validator-ha-db'));
    const otherStatefulSets = [...originalReplicas.entries()].filter(([name]) => !name.includes('validator-ha-db'));

    // Bring up HA DB first so we can run migrations before validators start
    for (const [stsName, replicas] of haDbStatefulSets) {
      try {
        const scaleCmd = `kubectl scale statefulset ${stsName} -n ${namespace} --replicas=${replicas} --timeout=2m`;
        logger.info(`command: ${scaleCmd}`);
        await execAsync(scaleCmd);
      } catch (e) {
        logger.verbose(`Scale up ${stsName} skipped: ${e}`);
      }
    }

    if (haDbStatefulSets.length > 0) {
      try {
        await waitForStatefulSetsReady({
          namespace,
          label: 'app.kubernetes.io/component=validator-ha-db',
          timeoutSeconds: 600,
        });
        await initHADb(namespace);
      } catch (e) {
        logger.warn(`HA DB migration step skipped or failed: ${e}`);
      }
    }

    // Scale remaining StatefulSets back up to original replica counts (by name, not label)
    for (const [stsName, replicas] of otherStatefulSets) {
      try {
        const scaleCmd = `kubectl scale statefulset ${stsName} -n ${namespace} --replicas=${replicas} --timeout=2m`;
        logger.info(`command: ${scaleCmd}`);
        await execAsync(scaleCmd);
      } catch (e) {
        logger.verbose(`Scale up ${stsName} skipped: ${e}`);
      }
    }
  } else {
    // Just delete pods (no state clearing)
    for (const component of podComponents) {
      await deleteResourceByLabel({
        resource: 'pods',
        namespace: namespace,
        label: `app.kubernetes.io/component=${component}`,
      });
    }
  }

  await sleep(10 * 1000);

  // Wait for StatefulSets to have all replicas ready.
  for (const component of statefulSetComponents) {
    try {
      await waitForStatefulSetsReady({
        namespace,
        label: `app.kubernetes.io/component=${component}`,
        timeoutSeconds: 600, // 10 minutes
      });
    } catch (e) {
      logger.warn(`StatefulSet component ${component} may not be fully ready: ${e}`);
    }
  }

  const nonStatefulSetComponents = podComponents.filter(c => !statefulSetComponents.includes(c));
  for (const component of nonStatefulSetComponents) {
    await waitForResourceByLabel({
      resource: 'pods',
      namespace: namespace,
      label: `app.kubernetes.io/component=${component}`,
    });
  }
}
