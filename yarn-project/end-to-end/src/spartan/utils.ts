import { createLogger, sleep } from '@aztec/aztec.js';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { L1ContractAddresses, ViemPublicClient } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { schemas } from '@aztec/foundation/schemas';
import {
  type AztecNodeAdmin,
  type AztecNodeAdminConfig,
  createAztecNodeAdminClient,
  createAztecNodeClient,
} from '@aztec/stdlib/interfaces/client';

import { ChildProcess, exec, execSync, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { createPublicClient, fallback, http } from 'viem';
import { z } from 'zod';

const execAsync = promisify(exec);

const logger = createLogger('e2e:k8s-utils');

const testConfigSchema = z.object({
  NAMESPACE: z.string().default('scenario'),
  REAL_VERIFIER: schemas.Boolean.optional().default(true),
  CREATE_ETH_DEVNET: schemas.Boolean.optional().default(false),
  L1_RPC_URLS_JSON: z.string().optional(),
});

export type TestConfig = z.infer<typeof testConfigSchema>;

export function setupEnvironment(env: unknown): TestConfig {
  const config = testConfigSchema.parse(env);
  logger.warn(`Loaded env config`, config);
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

  logger.debug(`kubectl port-forward -n ${namespace} ${resource} ${hostPortAsString}:${containerPort}`);

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
        logger.debug(`Port forward for ${resource}: ${str}`);
        const port = str.search(/:\d+/);
        if (port === -1) {
          throw new Error('Port not found in port forward output');
        }
        const portNumber = parseInt(str.slice(port + 1));
        logger.verbose(`Port forwarded for ${resource} at ${portNumber}:${containerPort}`);
        resolve(portNumber);
      } else {
        logger.silent(str);
      }
    });
    process.stderr?.on('data', data => {
      logger.verbose(`Port forward for ${resource}: ${data.toString()}`);
      // It's a strange thing:
      // If we don't pipe stderr, then the port forwarding does not work.
      // Log to silent because this doesn't actually report errors,
      // just extremely verbose debug logs.
      logger.silent(data.toString());
    });
    process.on('close', () => {
      if (!isResolved) {
        isResolved = true;
        logger.warn(`Port forward for ${resource} closed before connection established`);
        resolve(0);
      }
    });
    process.on('error', error => {
      logger.error(`Port forward for ${resource} error: ${error}`);
      resolve(0);
    });
    process.on('exit', code => {
      logger.verbose(`Port forward for ${resource} exited with code ${code}`);
      resolve(0);
    });
  });

  const port = await connected;

  return { process, port };
}

export function startPortForwardForRPC(namespace: string) {
  return startPortForward({
    resource: `services/${namespace}-rpc-aztec-node`,
    namespace,
    containerPort: 8080,
  });
}

export function startPortForwardForEthereum(namespace: string) {
  return startPortForward({
    resource: `services/${namespace}-eth-execution`,
    namespace,
    containerPort: 8545,
  });
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
  timeout = '5m',
  force = false,
}: {
  resource: string;
  namespace: string;
  label: string;
  timeout?: string;
  force?: boolean;
}) {
  // Check if the resource type exists before attempting to delete
  try {
    await execAsync(
      `kubectl api-resources --api-group="" --no-headers -o name | grep -q "^${resource}$" || kubectl api-resources --no-headers -o name | grep -q "^${resource}$"`,
    );
  } catch (error) {
    logger.warn(`Resource type '${resource}' not found in cluster, skipping deletion ${error}`);
    return '';
  }

  const command = `kubectl delete ${resource} -l ${label} -n ${namespace} --ignore-not-found=true --wait=true --timeout=${timeout} ${
    force ? '--force' : ''
  }`;
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
      label: `app.kubernetes.io/instance=${instanceName}`,
    };
    logger.info(`Deleting podchaos resource`);
    await deleteResourceByLabel(deleteArgs).catch(e => {
      logger.error(`Error deleting podchaos resource: ${e}`);
      logger.info(`Force deleting podchaos resource`);
      return deleteResourceByLabel({ ...deleteArgs, force: true });
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
  values,
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
  values?: Record<string, string | number>;
}) {
  return installChaosMeshChart({
    instanceName: 'validator-kill',
    targetNamespace: namespace,
    valuesFile: 'validator-kill.yaml',
    helmChartDir: getChartDir(spartanDir, 'aztec-chaos-scenarios'),
    logger,
    values,
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

export async function getSequencers(namespace: string) {
  const command = `kubectl get pods -l app.kubernetes.io/component=validator -n ${namespace} -o jsonpath='{.items[*].metadata.name}'`;
  const { stdout } = await execAsync(command);
  const sequencers = stdout.split(' ');
  logger.verbose(`Found sequencer pods ${sequencers.join(', ')}`);
  return sequencers;
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
 * Returns a public viem client to the eth execution node. If it was part of a local eth devnet,
 * it first port-forwards the service and points to it. Otherwise, just uses the external RPC url.
 */
export async function getPublicViemClient(
  env: TestConfig,
  /** If set, will push the new process into it */
  processes?: ChildProcess[],
): Promise<{ url: string; client: ViemPublicClient; process?: ChildProcess }> {
  const { NAMESPACE, CREATE_ETH_DEVNET, L1_RPC_URLS_JSON } = env;
  if (CREATE_ETH_DEVNET) {
    logger.info(`Creating port forward to eth execution node`);
    const { process, port } = await startPortForward({
      resource: `svc/${NAMESPACE}-eth-execution`,
      namespace: NAMESPACE,
      containerPort: 8545,
    });
    const url = `http://127.0.0.1:${port}`;
    const client: ViemPublicClient = createPublicClient({ transport: fallback([http(url)]) });
    if (processes) {
      processes.push(process);
    }
    return { url, client, process };
  } else {
    logger.info(`Connecting to the eth execution node at ${L1_RPC_URLS_JSON}`);
    if (!L1_RPC_URLS_JSON) {
      throw new Error(`L1_RPC_URLS_JSON is not defined`);
    }
    const client: ViemPublicClient = createPublicClient({ transport: fallback([http(L1_RPC_URLS_JSON)]) });
    return { url: L1_RPC_URLS_JSON, client };
  }
}

/** Queries an Aztec node for the L1 deployment addresses */
export async function getL1DeploymentAddresses(env: TestConfig): Promise<L1ContractAddresses> {
  let forwardProcess: ChildProcess | undefined;
  try {
    const [sequencer] = await getSequencers(env.NAMESPACE);
    const { process, port } = await startPortForward({
      resource: `pod/${sequencer}`,
      namespace: env.NAMESPACE,
      containerPort: 8080,
    });

    forwardProcess = process;
    const url = `http://127.0.0.1:${port}`;
    const node = createAztecNodeClient(url);
    return await retry(
      () => node.getNodeInfo().then(i => i.l1ContractAddresses),
      'get node info',
      makeBackoff([1, 3, 6]),
      logger,
    );
  } finally {
    forwardProcess?.kill();
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
