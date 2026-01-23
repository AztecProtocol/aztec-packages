import { createLogger } from '@aztec/aztec.js/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { type ChildProcess, exec, spawn } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const logger = createLogger('e2e:k8s-utils');

/**
 * Represents an endpoint to reach a K8s service.
 * May be a LoadBalancer external IP or a port-forward.
 */
export interface ServiceEndpoint {
  url: string;
  process?: ChildProcess;
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
  const connected = new Promise<number>((resolve, reject) => {
    process.stdout?.on('data', data => {
      const str = data.toString() as string;
      if (!isResolved && str.includes('Forwarding from')) {
        isResolved = true;
        logger.debug(`Port forward for ${resource}: ${str}`);
        const port = str.search(/:\d+/);
        if (port === -1) {
          reject(new Error('Port not found in port forward output'));
          return;
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
        const msg = `Port forward for ${resource} closed before connection established`;
        logger.warn(msg);
        reject(new Error(msg));
      }
    });
    process.on('error', error => {
      if (!isResolved) {
        isResolved = true;
        const msg = `Port forward for ${resource} error: ${error}`;
        logger.error(msg);
        reject(new Error(msg));
      }
    });
    process.on('exit', code => {
      if (!isResolved) {
        isResolved = true;
        const msg = `Port forward for ${resource} exited with code ${code}`;
        logger.verbose(msg);
        reject(new Error(msg));
      }
    });
  });

  const port = await connected;

  return { process, port };
}

export function getExternalIP(namespace: string, serviceName: string): Promise<string> {
  const { promise, resolve, reject } = promiseWithResolvers<string>();
  const process = spawn(
    'kubectl',
    [
      'get',
      'service',
      '-n',
      namespace,
      `${namespace}-${serviceName}`,
      '--output',
      "jsonpath='{.status.loadBalancer.ingress[0].ip}'",
    ],
    {
      stdio: 'pipe',
    },
  );

  let ip = '';
  process.stdout.on('data', data => {
    ip += data;
  });
  process.on('error', err => {
    reject(err);
  });
  process.on('exit', () => {
    // kubectl prints JSON. Remove the quotes
    resolve(ip.replace(/"|'/g, ''));
  });

  return promise;
}

/**
 * Gets an endpoint for a K8s service.
 * By default, tries to get the external IP first and falls back to port-forward if unavailable.
 *
 * @param opts.namespace - K8s namespace
 * @param opts.serviceName - Service name suffix (e.g., 'rpc-aztec-node', 'eth-execution')
 * @param opts.containerPort - Port the service exposes
 * @param opts.usePortForward - If true, skip external IP check and always use port-forward
 */
export async function getServiceEndpoint(opts: {
  namespace: string;
  serviceName: string;
  containerPort: number;
  forcePortForward?: boolean;
}): Promise<ServiceEndpoint> {
  const { namespace, serviceName, containerPort, forcePortForward } = opts;

  if (!forcePortForward) {
    const timeoutMs = 30_000;
    const pollIntervalMs = 5_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const ip = await getExternalIP(namespace, serviceName);
        if (ip && ip !== '' && ip !== '<pending>' && ip !== 'null') {
          logger.info(`Using external IP for ${serviceName}: ${ip}:${containerPort}`);
          return { url: `http://${ip}:${containerPort}` };
        }
      } catch (err) {
        logger.verbose(`Failed to get external IP for ${serviceName}: ${err}`);
      }
      await sleep(pollIntervalMs);
    }

    logger.warn(`External IP not available for ${serviceName} after ${timeoutMs}ms, using port-forward`);
  }

  // Fallback to port-forward
  const resource = `svc/${namespace}-${serviceName}`;

  const { process, port } = await startPortForward({
    resource,
    namespace,
    containerPort,
  });

  return { url: `http://127.0.0.1:${port}`, process };
}

/**
 * Gets an endpoint for the RPC node service.
 * Tries external IP first, falls back to port-forward.
 *
 * @param namespace - K8s namespace
 * @param usePortForward - If true, skip external IP and use port-forward directly
 */
export async function getRPCEndpoint(namespace: string, forcePortForward?: boolean): Promise<ServiceEndpoint> {
  return await getServiceEndpoint({
    namespace,
    serviceName: 'rpc-aztec-node',
    containerPort: 8080,
    forcePortForward,
  });
}

/**
 * Gets an endpoint for the Ethereum execution service.
 * Tries external IP first, falls back to port-forward.
 *
 * @param namespace - K8s namespace
 * @param usePortForward - If true, skip external IP and use port-forward directly
 */
export async function getEthereumEndpoint(namespace: string, forcePortForward?: boolean): Promise<ServiceEndpoint> {
  return await getServiceEndpoint({
    namespace,
    serviceName: 'eth-execution',
    containerPort: 8545,
    forcePortForward,
  });
}

export function startPortForwardForPrometeheus(namespace: string) {
  return startPortForward({
    resource: `svc/${namespace}-prometheus-server`,
    namespace,
    containerPort: 80,
  });
}

export function startPortForwardForRPC(namespace: string, index = 0) {
  return startPortForward({
    resource: `pod/${namespace}-rpc-aztec-node-${index}`,
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
  try {
    // Match both plain and group-qualified names (e.g., "podchaos" or "podchaos.chaos-mesh.org")
    const escaped = resource.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = `(^|\\.)${escaped}(\\.|$)`;
    await execAsync(`kubectl api-resources --no-headers -o name | grep -Eq '${regex}'`);
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

export async function waitForResourceByName({
  resource,
  name,
  namespace,
  condition = 'Ready',
  timeout = '10m',
}: {
  resource: string;
  name: string;
  namespace: string;
  condition?: string;
  timeout?: string;
}) {
  const command = `kubectl wait ${resource}/${name} --for=condition=${condition} -n ${namespace} --timeout=${timeout}`;
  logger.info(`command: ${command}`);
  const { stdout } = await execAsync(command);
  return stdout;
}

export async function waitForResourcesByName({
  resource,
  names,
  namespace,
  condition = 'Ready',
  timeout = '10m',
}: {
  resource: string;
  names: string[];
  namespace: string;
  condition?: string;
  timeout?: string;
}) {
  if (!names.length) {
    throw new Error(`No ${resource} names provided to waitForResourcesByName`);
  }

  // Wait all in parallel; if any fails, surface which one.
  await Promise.all(
    names.map(async name => {
      try {
        await waitForResourceByName({ resource, name, namespace, condition, timeout });
      } catch (err) {
        throw new Error(
          `Failed waiting for ${resource}/${name} condition=${condition} timeout=${timeout} namespace=${namespace}: ${String(
            err,
          )}`,
        );
      }
    }),
  );
}

export function getChartDir(spartanDir: string, chartName: string) {
  return path.join(spartanDir.trim(), chartName);
}
