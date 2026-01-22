import { createLogger } from '@aztec/aztec.js/log';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

import type { ChildProcess } from 'child_process';
import { createPublicClient, fallback, http } from 'viem';

import type { TestConfig } from './config.js';
import { startPortForward } from './k8s.js';
import { getSequencers } from './nodes.js';

const logger = createLogger('e2e:k8s-utils');

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
    const client: ViemPublicClient = createPublicClient({ transport: fallback([http(url, { batch: false })]) });
    if (processes) {
      processes.push(process);
    }
    return { url, client, process };
  } else {
    logger.info(`Connecting to the eth execution node at ${L1_RPC_URLS_JSON}`);
    if (!L1_RPC_URLS_JSON) {
      throw new Error(`L1_RPC_URLS_JSON is not defined`);
    }
    const client: ViemPublicClient = createPublicClient({
      transport: fallback([http(L1_RPC_URLS_JSON, { batch: false })]),
    });
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
    const node = createAztecNodeClient(url, {}, defaultFetch);
    return await retry(
      () => node.getNodeInfo().then(i => i.l1ContractAddresses),
      logger,
      'get node info',
      makeBackoff([1, 3, 6]),
    );
  } finally {
    forwardProcess?.kill();
  }
}

/** Returns a client to the RPC of the given sequencer (defaults to first) */
export async function getNodeClient(
  env: TestConfig,
  index: number = 0,
): Promise<{ node: ReturnType<typeof createAztecNodeClient>; port: number; process: ChildProcess }> {
  const namespace = env.NAMESPACE;
  const containerPort = 8080;
  const sequencers = await getSequencers(namespace);
  const sequencer = sequencers[index];
  if (!sequencer) {
    throw new Error(`No sequencer found at index ${index} in namespace ${namespace}`);
  }

  const { process, port } = await startPortForward({
    resource: `pod/${sequencer}`,
    namespace,
    containerPort,
  });

  const url = `http://localhost:${port}`;
  await retry(
    () => fetch(`${url}/status`).then(res => res.status === 200),
    logger,
    'forward port',
    makeBackoff([1, 1, 2, 6]),
    true,
  );

  const client = createAztecNodeClient(url, {}, defaultFetch);
  return { node: client, port, process };
}
