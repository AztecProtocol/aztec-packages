import { createDebugLogger } from '@aztec/aztec.js';

import { exec, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

const logger = createDebugLogger('k8s-utils');

const k8sConfigSchema = z.object({
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
}: {
  resource: string;
  namespace: string;
  name: string;
}) {
  const command = `kubectl delete ${resource} ${name} -n ${namespace} --ignore-not-found=true --wait=true`;
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

function valuesToArgs(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => `--set ${key}=${value}`)
    .join(' ');
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
 * const stdout = await installChaosMeshChart({ instanceName: 'force-reorg', targetNamespace: 'smoke', valuesFile: 'kill-provers.yaml'});
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
}: {
  instanceName: string;
  targetNamespace: string;
  valuesFile: string;
  helmChartDir: string;
  chaosMeshNamespace?: string;
  timeout?: string;
  clean?: boolean;
  values?: Record<string, string>;
}) {
  if (clean) {
    // uninstall the helm chart if it exists
    await execAsync(`helm uninstall ${instanceName} --namespace ${chaosMeshNamespace} --wait --ignore-not-found`);
    // and delete the podchaos resource
    await deleteResourceByName({
      resource: 'podchaos',
      namespace: chaosMeshNamespace,
      name: `${targetNamespace}-${instanceName}`,
    });
  }

  const helmCommand = `helm upgrade --install ${instanceName} ${helmChartDir} --namespace ${chaosMeshNamespace} --values ${helmChartDir}/values/${valuesFile} --wait --timeout=${timeout} --set global.targetNamespace=${targetNamespace}  ${valuesToArgs(
    values,
  )}`;
  const { stdout } = await execAsync(helmCommand);
  return stdout;
}

export function applyKillProvers({
  namespace,
  spartanDir,
  durationSeconds,
}: {
  namespace: string;
  spartanDir: string;
  durationSeconds: number;
}) {
  return installChaosMeshChart({
    instanceName: 'kill-provers',
    targetNamespace: namespace,
    valuesFile: 'kill-provers.yaml',
    helmChartDir: getChartDir(spartanDir, 'network-shaping'),
    values: {
      'networkShaping.conditions.killProvers.duration': `${durationSeconds}s`,
    },
  });
}
