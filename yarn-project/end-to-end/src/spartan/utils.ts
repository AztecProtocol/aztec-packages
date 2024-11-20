import { createDebugLogger, sleep } from '@aztec/aztec.js';
import type { Logger } from '@aztec/foundation/log';

import { exec, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';

import type { RollupCheatCodes } from '../../../aztec.js/src/utils/cheat_codes.js';

const execAsync = promisify(exec);

const logger = createDebugLogger('k8s-utils');

const k8sConfigSchema = z.object({
  INSTANCE_NAME: z.string().min(1, 'INSTANCE_NAME env variable must be set'),
  NAMESPACE: z.string().min(1, 'NAMESPACE env variable must be set'),
  HOST_PXE_PORT: z.coerce.number().min(1, 'HOST_PXE_PORT env variable must be set'),
  CONTAINER_PXE_PORT: z.coerce.number().default(8080),
  HOST_ETHEREUM_PORT: z.coerce.number().min(1, 'HOST_ETHEREUM_PORT env variable must be set'),
  CONTAINER_ETHEREUM_PORT: z.coerce.number().default(8545),
  SPARTAN_DIR: z.string().min(1, 'SPARTAN_DIR env variable must be set'),
  K8S: z.literal('true'),
});

const directConfigSchema = z.object({
  PXE_URL: z.string().url('PXE_URL must be a valid URL'),
  ETHEREUM_HOST: z.string().url('ETHEREUM_HOST must be a valid URL'),
  K8S: z.literal('false'),
});

const envSchema = z.discriminatedUnion('K8S', [k8sConfigSchema, directConfigSchema]);

export type K8sConfig = z.infer<typeof k8sConfigSchema>;
export type DirectConfig = z.infer<typeof directConfigSchema>;
export type EnvConfig = z.infer<typeof envSchema>;

export function getConfig(env: unknown): EnvConfig {
  return envSchema.parse(env);
}

export function isK8sConfig(config: EnvConfig): config is K8sConfig {
  return config.K8S === 'true';
}

export async function startPortForward({
  resource,
  namespace,
  containerPort,
  hostPort,
}: {
  resource: string;
  namespace: string;
  containerPort: number;
  hostPort: number;
}) {
  // check if kubectl is already forwarding this port
  try {
    const command = `ps aux | grep 'kubectl.*${hostPort}:${containerPort}' | grep -v grep | awk '{print $2}'`;
    const { stdout: processId } = await execAsync(command);
    if (processId) {
      logger.info(`Restarting port forward for ${resource}:${hostPort}`);
      // kill the existing port forward
      await execAsync(`kill -9 ${processId}`);
    }
  } catch (e) {
    logger.info(`No existing port forward found for ${resource}:${hostPort}`);
  }

  logger.info(`kubectl port-forward -n ${namespace} ${resource} ${hostPort}:${containerPort}`);

  const process = spawn('kubectl', ['port-forward', '-n', namespace, resource, `${hostPort}:${containerPort}`], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  process.stdout?.on('data', data => {
    logger.info(data.toString());
  });
  process.stderr?.on('data', data => {
    // It's a strange thing:
    // If we don't pipe stderr, then the port forwarding does not work.
    // Log to silent because this doesn't actually report errors,
    // just extremely verbose debug logs.
    logger.debug(data.toString());
  });

  // Wait a moment for the port forward to establish
  await new Promise(resolve => setTimeout(resolve, 2000));

  return process;
}

export async function deleteResourceByName({
  resource,
  namespace,
  name,
  force = false,
}: {
  resource: string;
  namespace: string;
  name: string;
  force?: boolean;
}) {
  const command = `kubectl delete ${resource} ${name} -n ${namespace} --ignore-not-found=true --wait=true ${
    force ? '--force' : ''
  }`;
  logger.info(`command: ${command}`);
  const { stdout } = await execAsync(command);
  return stdout;
}

export async function deleteResourceByLabel({
  resource,
  namespace,
  label,
}: {
  resource: string;
  namespace: string;
  label: string;
}) {
  const command = `kubectl delete ${resource} -l ${label} -n ${namespace} --ignore-not-found=true --wait=true`;
  logger.info(`command: ${command}`);
  const { stdout } = await execAsync(command);
  return stdout;
}

export async function waitForResourceByLabel({
  resource,
  label,
  namespace,
  condition = 'Ready',
  timeout = '10m',
}: {
  resource: string;
  label: string;
  namespace: string;
  condition?: string;
  timeout?: string;
}) {
  const command = `kubectl wait ${resource} -l ${label} --for=condition=${condition} -n ${namespace} --timeout=${timeout}`;
  logger.info(`command: ${command}`);
  const { stdout } = await execAsync(command);
  return stdout;
}

export function getChartDir(spartanDir: string, chartName: string) {
  return path.join(spartanDir.trim(), chartName);
}

function valuesToArgs(values: Record<string, string | number>) {
  return Object.entries(values)
    .map(([key, value]) => `--set ${key}=${value}`)
    .join(' ');
}

function createHelmCommand({
  instanceName,
  helmChartDir,
  namespace,
  valuesFile,
  timeout,
  values,
  reuseValues = false,
}: {
  instanceName: string;
  helmChartDir: string;
  namespace: string;
  valuesFile: string | undefined;
  timeout: string;
  values: Record<string, string | number>;
  reuseValues?: boolean;
}) {
  const valuesFileArgs = valuesFile ? `--values ${helmChartDir}/values/${valuesFile}` : '';
  const reuseValuesArgs = reuseValues ? '--reuse-values' : '';
  return `helm upgrade --install ${instanceName} ${helmChartDir} --namespace ${namespace} ${valuesFileArgs} ${reuseValuesArgs} --wait --timeout=${timeout} ${valuesToArgs(
    values,
  )}`;
}

async function execHelmCommand(args: Parameters<typeof createHelmCommand>[0]) {
  const helmCommand = createHelmCommand(args);
  logger.info(`helm command: ${helmCommand}`);
  const { stdout } = await execAsync(helmCommand);
  return stdout;
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
  chaosMeshNamespace = 'chaos-mesh',
  timeout = '5m',
  clean = true,
  values = {},
  logger,
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
    // uninstall the helm chart if it exists
    logger.info(`Uninstalling helm chart ${instanceName}`);
    await execAsync(`helm uninstall ${instanceName} --namespace ${chaosMeshNamespace} --wait --ignore-not-found`);
    // and delete the podchaos resource
    const deleteArgs = {
      resource: 'podchaos',
      namespace: chaosMeshNamespace,
      name: `${targetNamespace}-${instanceName}`,
    };
    logger.info(`Deleting podchaos resource`);
    await deleteResourceByName(deleteArgs).catch(e => {
      logger.error(`Error deleting podchaos resource: ${e}`);
      logger.info(`Force deleting podchaos resource`);
      return deleteResourceByName({ ...deleteArgs, force: true });
    });
  }

  return execHelmCommand({
    instanceName,
    helmChartDir,
    namespace: chaosMeshNamespace,
    valuesFile,
    timeout,
    values: { ...values, 'global.targetNamespace': targetNamespace },
  });
}

export function applyProverFailure({
  namespace,
  spartanDir,
  durationSeconds,
  logger,
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
    logger,
  });
}

export function applyBootNodeFailure({
  namespace,
  spartanDir,
  durationSeconds,
  logger,
}: {
  namespace: string;
  spartanDir: string;
  durationSeconds: number;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'boot-node-failure',
    targetNamespace: namespace,
    valuesFile: 'boot-node-failure.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    values: {
      'bootNodeFailure.duration': `${durationSeconds}s`,
    },
    logger,
  });
}

export function applyValidatorKill({
  namespace,
  spartanDir,
  logger,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'validator-kill',
    targetNamespace: namespace,
    valuesFile: 'validator-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    logger,
  });
}

export function applyNetworkShaping({
  valuesFile,
  namespace,
  spartanDir,
  logger,
}: {
  valuesFile: string;
  namespace: string;
  spartanDir: string;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'network-shaping',
    targetNamespace: namespace,
    valuesFile,
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    logger,
  });
}

export async function awaitL2BlockNumber(
  rollupCheatCodes: RollupCheatCodes,
  blockNumber: bigint,
  timeoutSeconds: number,
  logger: Logger,
) {
  logger.info(`Waiting for L2 Block ${blockNumber}`);
  let tips = await rollupCheatCodes.getTips();
  const endTime = Date.now() + timeoutSeconds * 1000;
  while (tips.pending < blockNumber && Date.now() < endTime) {
    logger.info(`At L2 Block ${tips.pending}`);
    await sleep(1000);
    tips = await rollupCheatCodes.getTips();
  }
  logger.info(`Reached L2 Block ${tips.pending}`);
}

export async function restartBot(namespace: string, logger: Logger) {
  logger.info(`Restarting bot`);
  await deleteResourceByLabel({ resource: 'pods', namespace, label: 'app=bot' });
  await sleep(10 * 1000);
  await waitForResourceByLabel({ resource: 'pods', namespace, label: 'app=bot' });
  logger.info(`Bot restarted`);
}

export async function enableValidatorDynamicBootNode(
  instanceName: string,
  namespace: string,
  spartanDir: string,
  logger: Logger,
) {
  logger.info(`Enabling validator dynamic boot node`);
  await execHelmCommand({
    instanceName,
    namespace,
    helmChartDir: getChartDir(spartanDir, 'aztec-network'),
    values: {
      'validator.dynamicBootNode': 'true',
    },
    valuesFile: undefined,
    timeout: '10m',
    reuseValues: true,
  });

  logger.info(`Validator dynamic boot node enabled`);
}
