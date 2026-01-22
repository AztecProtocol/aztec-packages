import { createLogger } from '@aztec/aztec.js/log';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
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
import { deleteResourceByLabel, getChartDir, startPortForward, waitForResourceByLabel } from './k8s.js';

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
    const { process, port } = await startPortForward({
      resource: `pod/${sequencer}`,
      namespace,
      containerPort: adminContainerPort,
    });

    const url = `http://localhost:${port}`;
    await retry(
      () => fetch(`${url}/status`).then(res => res.status === 200),
      'forward node admin port',
      makeBackoff([1, 1, 2, 6]),
      logger,
      true,
    );
    const client = createAztecNodeAdminClient(url);
    results.push(await fn(client));
    process.kill();
  }

  return results;
}

/**
 * Enables or disables probabilistic transaction dropping on validators and waits for rollout.
 * Wired to env vars P2P_DROP_TX and P2P_DROP_TX_CHANCE via Helm values.
 */
export async function setValidatorTxDrop({
  namespace,
  enabled,
  probability,
  logger: log,
}: {
  namespace: string;
  enabled: boolean;
  probability: number;
  logger: Logger;
}) {
  const drop = enabled ? 'true' : 'false';
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
      const cmd = `kubectl set env statefulset -l ${selector} -n ${namespace} P2P_DROP_TX=${drop} P2P_DROP_TX_CHANCE=${prob}`;
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
  const podComponents = ['p2p-bootstrap', 'prover-node', 'prover-broker', 'prover-agent', 'sequencer-node', 'rpc'];
  const pvcComponents = ['p2p-bootstrap', 'prover-node', 'prover-broker', 'sequencer-node', 'rpc'];
  // StatefulSet components that need to be scaled down before PVC deletion
  // Note: validators use 'sequencer-node' as component label, not 'validator'
  const statefulSetComponents = ['p2p-bootstrap', 'prover-node', 'prover-broker', 'sequencer-node', 'rpc'];

  if (clearState) {
    // To delete PVCs, we must first scale down StatefulSets so pods release the volumes
    // Otherwise PVC deletion will hang waiting for pods to terminate

    // First, save original replica counts
    const originalReplicas: Map<string, number> = new Map();
    for (const component of statefulSetComponents) {
      try {
        const getCmd = `kubectl get statefulset -l app.kubernetes.io/component=${component} -n ${namespace} -o jsonpath='{.items[0].spec.replicas}'`;
        const { stdout } = await execAsync(getCmd);
        const replicas = parseInt(stdout.replace(/'/g, '').trim(), 10);
        if (!isNaN(replicas) && replicas > 0) {
          originalReplicas.set(component, replicas);
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

    // Wait for pods to terminate
    await sleep(15 * 1000);

    // Now delete PVCs (they should no longer be in use)
    for (const component of pvcComponents) {
      await deleteResourceByLabel({
        resource: 'persistentvolumeclaims',
        namespace: namespace,
        label: `app.kubernetes.io/component=${component}`,
      });
    }

    // Scale StatefulSets back up to original replica counts
    for (const component of statefulSetComponents) {
      const replicas = originalReplicas.get(component) ?? 1;
      try {
        const scaleCmd = `kubectl scale statefulset -l app.kubernetes.io/component=${component} -n ${namespace} --replicas=${replicas} --timeout=2m`;
        logger.info(`command: ${scaleCmd}`);
        await execAsync(scaleCmd);
      } catch (e) {
        logger.verbose(`Scale up ${component} skipped: ${e}`);
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

  // Wait for pods to come back
  for (const component of podComponents) {
    await waitForResourceByLabel({
      resource: 'pods',
      namespace: namespace,
      label: `app.kubernetes.io/component=${component}`,
    });
  }
}
