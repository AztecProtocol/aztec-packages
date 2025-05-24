import { createLogger, sleep } from '@aztec/aztec.js';
import type { RollupCheatCodes } from '@aztec/aztec.js/testing';
import type { Logger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import type { SequencerConfig } from '@aztec/sequencer-client';
import { createAztecNodeAdminClient } from '@aztec/stdlib/interfaces/client';

import { ChildProcess, exec, execSync, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';

import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';

const execAsync = promisify(exec);

const logger = createLogger('e2e:k8s-utils');

const ethereumHostsSchema = z.string().refine(
  str =>
    str.split(',').every(url => {
      try {
        new URL(url.trim());
        return true;
      } catch {
        return false;
      }
    }),
  'ETHEREUM_HOSTS must be a comma-separated list of valid URLs',
);

const k8sLocalConfigSchema = z.object({
  ETHEREUM_SLOT_DURATION: z.coerce.number().min(1, 'ETHEREUM_SLOT_DURATION env variable must be set'),
  AZTEC_SLOT_DURATION: z.coerce.number().min(1, 'AZTEC_SLOT_DURATION env variable must be set'),
  AZTEC_EPOCH_DURATION: z.coerce.number().min(1, 'AZTEC_EPOCH_DURATION env variable must be set'),
  AZTEC_PROOF_SUBMISSION_WINDOW: z.coerce.number().min(1, 'AZTEC_PROOF_SUBMISSION_WINDOW env variable must be set'),
  INSTANCE_NAME: z.string().min(1, 'INSTANCE_NAME env variable must be set'),
  NAMESPACE: z.string().min(1, 'NAMESPACE env variable must be set'),
  CONTAINER_NODE_PORT: z.coerce.number().default(8080),
  CONTAINER_NODE_ADMIN_PORT: z.coerce.number().default(8880),
  CONTAINER_SEQUENCER_PORT: z.coerce.number().default(8080),
  CONTAINER_PROVER_NODE_PORT: z.coerce.number().default(8080),
  CONTAINER_PXE_PORT: z.coerce.number().default(8080),
  CONTAINER_ETHEREUM_PORT: z.coerce.number().default(8545),
  CONTAINER_METRICS_PORT: z.coerce.number().default(80),
  GRAFANA_PASSWORD: z.string().optional(),
  METRICS_API_PATH: z.string().default('/api/datasources/proxy/uid/spartan-metrics-prometheus/api/v1'),
  SPARTAN_DIR: z.string().min(1, 'SPARTAN_DIR env variable must be set'),
  ETHEREUM_HOSTS: ethereumHostsSchema.optional(),
  L1_ACCOUNT_MNEMONIC: z.string().default('test test test test test test test test test test test junk'),
  SEPOLIA_RUN: z.string().default('false'),
  K8S: z.literal('local'),
});

const k8sGCloudConfigSchema = k8sLocalConfigSchema.extend({
  K8S: z.literal('gcloud'),
  CLUSTER_NAME: z.string().min(1, 'CLUSTER_NAME env variable must be set'),
  REGION: z.string().min(1, 'REGION env variable must be set'),
  PROJECT_ID: z.string().min(1, 'PROJECT_ID env variable must be set'),
});

const directConfigSchema = z.object({
  PXE_URL: z.string().url('PXE_URL must be a valid URL'),
  NODE_URL: z.string().url('NODE_URL must be a valid URL'),
  NODE_ADMIN_URL: z.string().url('NODE_ADMIN_URL must be a valid URL'),
  ETHEREUM_HOSTS: ethereumHostsSchema,
  K8S: z.literal('false'),
});

const envSchema = z.discriminatedUnion('K8S', [k8sLocalConfigSchema, k8sGCloudConfigSchema, directConfigSchema]);

export type K8sLocalConfig = z.infer<typeof k8sLocalConfigSchema>;
export type K8sGCloudConfig = z.infer<typeof k8sGCloudConfigSchema>;
export type DirectConfig = z.infer<typeof directConfigSchema>;
export type EnvConfig = z.infer<typeof envSchema>;

export function isK8sConfig(config: EnvConfig): config is K8sLocalConfig | K8sGCloudConfig {
  return config.K8S === 'local' || config.K8S === 'gcloud';
}

export function isGCloudConfig(config: EnvConfig): config is K8sGCloudConfig {
  return config.K8S === 'gcloud';
}

export function setupEnvironment(env: unknown): EnvConfig {
  const config = envSchema.parse(env);
  if (isGCloudConfig(config)) {
    const command = `gcloud container clusters get-credentials ${config.CLUSTER_NAME} --region=${config.REGION} --project=${config.PROJECT_ID}`;
    execSync(command);
  }
  return config;
}

/**
 * @param path - The path to the script, relative to the project root
 * @param args - The arguments to pass to the script
 * @param logger - The logger to use
 * @returns The exit code of the script
 */
function runScript(path: string, args: string[], logger: Logger, env?: Record<string, string>) {
  const childProcess = spawn(path, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  });
  return new Promise<number>((resolve, reject) => {
    childProcess.on('close', (code: number | null) => resolve(code ?? 0));
    childProcess.on('error', reject);
    childProcess.stdout?.on('data', (data: Buffer) => {
      logger.info(data.toString());
    });
    childProcess.stderr?.on('data', (data: Buffer) => {
      logger.error(data.toString());
    });
  });
}

export function getAztecBin() {
  return path.join(getGitProjectRoot(), 'yarn-project/aztec/dest/bin/index.js');
}

/**
 * Runs the Aztec binary
 * @param args - The arguments to pass to the Aztec binary
 * @param logger - The logger to use
 * @param env - Optional environment variables to set for the process
 * @returns The exit code of the Aztec binary
 */
export function runAztecBin(args: string[], logger: Logger, env?: Record<string, string>) {
  return runScript('node', [getAztecBin(), ...args], logger, env);
}

export function runProjectScript(script: string, args: string[], logger: Logger, env?: Record<string, string>) {
  const scriptPath = script.startsWith('/') ? script : path.join(getGitProjectRoot(), script);
  return runScript(scriptPath, args, logger, env);
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
  // If not provided, the port will be chosen automatically
  hostPort?: number;
}): Promise<{
  process: ChildProcess;
  port: number;
}> {
  const hostPortAsString = hostPort ? hostPort.toString() : '';

  logger.info(`kubectl port-forward -n ${namespace} ${resource} ${hostPortAsString}:${containerPort}`);

  const process = spawn(
    'kubectl',
    ['port-forward', '-n', namespace, resource, `${hostPortAsString}:${containerPort}`],
    {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let isResolved = false;
  const connected = new Promise<number>(resolve => {
    process.stdout?.on('data', data => {
      const str = data.toString() as string;
      if (!isResolved && str.includes('Forwarding from')) {
        isResolved = true;
        logger.info(str);
        const port = str.search(/:\d+/);
        if (port === -1) {
          throw new Error('Port not found in port forward output');
        }
        const portNumber = parseInt(str.slice(port + 1));
        logger.info(`Port forward connected: ${portNumber}`);
        resolve(portNumber);
      } else {
        logger.silent(str);
      }
    });
    process.stderr?.on('data', data => {
      logger.info(data.toString());
      // It's a strange thing:
      // If we don't pipe stderr, then the port forwarding does not work.
      // Log to silent because this doesn't actually report errors,
      // just extremely verbose debug logs.
      logger.silent(data.toString());
    });
    process.on('close', () => {
      if (!isResolved) {
        isResolved = true;
        logger.warn('Port forward closed before connection established');
        resolve(0);
      }
    });
    process.on('error', error => {
      logger.error(`Port forward error: ${error}`);
      resolve(0);
    });
    process.on('exit', code => {
      logger.info(`Port forward exited with code ${code}`);
      resolve(0);
    });
  });

  const port = await connected;

  return { process, port };
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

export function applyProverKill({
  namespace,
  spartanDir,
  logger,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'prover-kill',
    targetNamespace: namespace,
    valuesFile: 'prover-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    clean: true,
    logger,
  });
}

export function applyProverBrokerKill({
  namespace,
  spartanDir,
  logger,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
}) {
  return installChaosMeshChart({
    instanceName: 'prover-broker-kill',
    targetNamespace: namespace,
    valuesFile: 'prover-broker-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    clean: true,
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
  if (tips.pending < blockNumber) {
    throw new Error(`Timeout waiting for L2 Block ${blockNumber}, only reached ${tips.pending}`);
  } else {
    logger.info(`Reached L2 Block ${tips.pending}`);
  }
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
    timeout: '15m',
    reuseValues: true,
  });

  logger.info(`Validator dynamic boot node enabled`);
}

export async function runAlertCheck(config: EnvConfig, alerts: AlertConfig[], logger: Logger) {
  if (isK8sConfig(config)) {
    const { process, port } = await startPortForward({
      resource: `svc/metrics-grafana`,
      namespace: 'metrics',
      containerPort: config.CONTAINER_METRICS_PORT,
    });
    const alertChecker = new AlertChecker(logger, {
      grafanaEndpoint: `http://localhost:${port}${config.METRICS_API_PATH}`,
      grafanaCredentials: `admin:${config.GRAFANA_PASSWORD}`,
    });
    await alertChecker.runAlertCheck(alerts);
    process.kill();
  } else {
    logger.info('Not running alert check in non-k8s environment');
  }
}

export async function updateSequencerConfig(url: string, config: Partial<SequencerConfig>) {
  const node = createAztecNodeAdminClient(url);
  // Retry incase the port forward is not ready yet
  await retry(() => node.setConfig(config), 'Update sequencer config', makeBackoff([1, 3, 6]), logger);
}

export async function getSequencers(namespace: string) {
  const command = `kubectl get pods -l app=validator -n ${namespace} -o jsonpath='{.items[*].metadata.name}'`;
  const { stdout } = await execAsync(command);
  return stdout.split(' ');
}

async function updateK8sSequencersConfig(args: {
  containerPort: number;
  namespace: string;
  config: Partial<SequencerConfig>;
}) {
  const { containerPort, namespace, config } = args;
  const sequencers = await getSequencers(namespace);
  for (const sequencer of sequencers) {
    const { process, port } = await startPortForward({
      resource: `pod/${sequencer}`,
      namespace,
      containerPort,
    });

    const url = `http://localhost:${port}`;
    await updateSequencerConfig(url, config);
    process.kill();
  }
}

export async function updateSequencersConfig(env: EnvConfig, config: Partial<SequencerConfig>) {
  if (isK8sConfig(env)) {
    await updateK8sSequencersConfig({
      containerPort: env.CONTAINER_NODE_ADMIN_PORT,
      namespace: env.NAMESPACE,
      config,
    });
  } else {
    await updateSequencerConfig(env.NODE_ADMIN_URL, config);
  }
}

/**
 * Rolls the Aztec pods in the given namespace.
 * @param namespace - The namespace to roll the Aztec pods in.
 * @dev - IMPORTANT: This function DOES NOT delete the underlying PVCs.
 *        This means that the pods will be restarted with the same persistent storage.
 *        This is useful for testing, but you should be aware of the implications.
 */
export async function rollAztecPods(namespace: string) {
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=boot-node' });
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-node' });
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-broker' });
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-agent' });
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=validator' });
  await deleteResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=pxe' });
  await sleep(10 * 1000);
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=boot-node' });
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-node' });
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-broker' });
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=prover-agent' });
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=validator' });
  await waitForResourceByLabel({ resource: 'pods', namespace: namespace, label: 'app=pxe' });
}

/**
 * Returns the absolute path to the git repository root
 */
export function getGitProjectRoot(): string {
  try {
    const rootDir = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return rootDir;
  } catch (error) {
    throw new Error(`Failed to determine git project root: ${error}`);
  }
}
