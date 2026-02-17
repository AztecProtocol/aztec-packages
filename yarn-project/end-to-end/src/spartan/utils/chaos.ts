import type { Logger } from '@aztec/foundation/log';

import { exec } from 'child_process';
import { promisify } from 'util';

import { execHelmCommand } from './helm.js';
import { deleteResourceByLabel, getChartDir } from './k8s.js';

const execAsync = promisify(exec);

export async function uninstallChaosMesh(instanceName: string, namespace: string, log: Logger) {
  // uninstall the helm chart if it exists
  log.info(`Uninstalling helm chart ${instanceName}`);
  await execAsync(`helm uninstall ${instanceName} --namespace ${namespace} --wait --ignore-not-found`);
  // and delete the chaos-mesh resources created by this release
  const deleteByLabel = async (resource: string) => {
    const args = {
      resource,
      namespace: namespace,
      label: `app.kubernetes.io/instance=${instanceName}`,
    } as const;
    log.info(`Deleting ${resource} resources for release ${instanceName}`);
    await deleteResourceByLabel(args).catch(e => {
      log.error(`Error deleting ${resource}: ${e}`);
      log.info(`Force deleting ${resource}`);
      return deleteResourceByLabel({ ...args, force: true });
    });
  };

  await deleteByLabel('podchaos');
  await deleteByLabel('networkchaos');
  await deleteByLabel('podnetworkchaos');
  await deleteByLabel('workflows');
  await deleteByLabel('workflownodes');
}

/**
 * Installs a Helm chart with the given parameters.
 * @param instanceName - The name of the Helm chart instance.
 * @param targetNamespace - The namespace with the resources to be affected by the Helm chart.
 * @param valuesFile - The values file to use for the Helm chart.
 * @param chaosMeshNamespace - The namespace to install the Helm chart in.
 * @param timeout - The timeout for the Helm command.
 * @param clean - Whether to clean up the Helm chart before installing it.
 * @returns The stdout of the Helm command.
 * @throws If the Helm command fails.
 *
 * Example usage:
 * ```typescript
 * const stdout = await installChaosMeshChart({ instanceName: 'force-reorg', targetNamespace: 'smoke', valuesFile: 'prover-failure.yaml'});
 * console.log(stdout);
 * ```
 */
export async function installChaosMeshChart({
  instanceName,
  targetNamespace,
  valuesFile,
  helmChartDir,
  timeout = '10m',
  clean = true,
  values = {},
  logger: log,
}: {
  instanceName: string;
  targetNamespace: string;
  valuesFile: string;
  helmChartDir: string;
  chaosMeshNamespace?: string;
  timeout?: string;
  clean?: boolean;
  values?: Record<string, string | number>;
  logger: Logger;
}) {
  if (clean) {
    await uninstallChaosMesh(instanceName, targetNamespace, log);
  }

  return execHelmCommand({
    instanceName,
    helmChartDir,
    namespace: targetNamespace,
    valuesFile,
    timeout,
    values: { ...values, 'global.targetNamespace': targetNamespace },
  });
}

export function applyProverFailure({
  namespace,
  spartanDir,
  durationSeconds,
  logger: log,
}: {
  namespace: string;
  spartanDir: string;
  durationSeconds: number;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'prover-failure',
    targetNamespace: namespace,
    valuesFile: 'prover-failure.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    values: {
      'proverFailure.duration': `${durationSeconds}s`,
    },
    logger: log,
  });
}

export function applyValidatorFailure({
  namespace,
  spartanDir,
  logger: log,
  values,
  instanceName,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
  values?: Record<string, string | number>;
  instanceName?: string;
}) {
  return installChaosMeshChart({
    instanceName: instanceName ?? 'validator-failure',
    targetNamespace: namespace,
    valuesFile: 'validator-failure.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    values,
    logger: log,
  });
}

export function applyProverKill({
  namespace,
  spartanDir,
  logger: log,
  values,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
  values?: Record<string, string | number>;
}) {
  return installChaosMeshChart({
    instanceName: 'prover-kill',
    targetNamespace: namespace,
    valuesFile: 'prover-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    chaosMeshNamespace: namespace,
    clean: true,
    logger: log,
    values,
  });
}

export function applyProverBrokerKill({
  namespace,
  spartanDir,
  logger: log,
  values,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
  values?: Record<string, string | number>;
}) {
  return installChaosMeshChart({
    instanceName: 'prover-broker-kill',
    targetNamespace: namespace,
    valuesFile: 'prover-broker-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    clean: true,
    logger: log,
    values,
  });
}

export function applyBootNodeFailure({
  instanceName = 'boot-node-failure',
  namespace,
  spartanDir,
  durationSeconds,
  logger: log,
  values,
}: {
  instanceName?: string;
  namespace: string;
  spartanDir: string;
  durationSeconds: number;
  logger: Logger;
  values?: Record<string, string | number>;
}) {
  return installChaosMeshChart({
    instanceName,
    targetNamespace: namespace,
    valuesFile: 'boot-node-failure.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    values: {
      'bootNodeFailure.duration': `${durationSeconds}s`,
      ...(values ?? {}),
    },
    logger: log,
  });
}

export function applyValidatorKill({
  instanceName = 'validator-kill',
  namespace,
  spartanDir,
  logger: log,
  values,
  clean = true,
}: {
  instanceName?: string;
  namespace: string;
  spartanDir: string;
  logger: Logger;
  values?: Record<string, string | number>;
  clean?: boolean;
}) {
  return installChaosMeshChart({
    instanceName: instanceName ?? 'validator-kill',
    targetNamespace: namespace,
    valuesFile: 'validator-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    clean,
    logger: log,
    values,
  });
}

export function applyNetworkShaping({
  instanceName = 'network-shaping',
  valuesFile,
  namespace,
  spartanDir,
  logger: log,
}: {
  instanceName?: string;
  valuesFile: string;
  namespace: string;
  spartanDir: string;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName,
    targetNamespace: namespace,
    valuesFile,
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    logger: log,
  });
}
