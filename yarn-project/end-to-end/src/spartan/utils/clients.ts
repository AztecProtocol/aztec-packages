import { createLogger } from '@aztec/aztec.js/log';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

import type { ChildProcess } from 'child_process';
import { createPublicClient, fallback, http } from 'viem';

import type { TestConfig } from './config.js';
import { type ServiceEndpoint, getEthereumEndpoint, getRPCEndpoint } from './k8s.js';

const logger = createLogger('e2e:k8s-utils');

/**
 * Returns a public viem client to the eth execution node.
 * Tries external IP first, falls back to port-forward.
 * If CREATE_ETH_DEVNET is false, uses the external RPC url from L1_RPC_URLS_JSON.
 *
 * @param env - Test environment config
 * @param forcePortForward - If true, skip external IP and use port-forward directly
 * @returns URL, client, and optional process (if port-forward was used). Caller must kill process when done.
 */
export async function getPublicViemClient(
  env: TestConfig,
  forcePortForward?: boolean,
): Promise<{
  url: string;
  client: ViemPublicClient;
  process?: ChildProcess;
}> {
  const { NAMESPACE, CREATE_ETH_DEVNET, L1_RPC_URLS_JSON } = env;
  if (CREATE_ETH_DEVNET) {
    logger.info(`Connecting to eth execution node in namespace ${NAMESPACE}`);
    const endpoint = await getEthereumEndpoint(NAMESPACE, forcePortForward);
    const client: ViemPublicClient = createPublicClient({
      transport: fallback([http(endpoint.url, { batch: false })]),
    });
    return { url: endpoint.url, client, process: endpoint.process };
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

/**
 * Queries an Aztec node for the L1 deployment addresses.
 *
 * @param env - Test environment config
 * @param forcePortForward - If true, skip external IP and use port-forward directly
 */
export async function getL1DeploymentAddresses(
  env: TestConfig,
  forcePortForward?: boolean,
): Promise<L1ContractAddresses> {
  let endpoint: ServiceEndpoint | undefined;
  try {
    endpoint = await getRPCEndpoint(env.NAMESPACE, forcePortForward);
    const node = createAztecNodeClient(endpoint.url);
    return await retry(
      () => node.getNodeInfo().then(i => i.l1ContractAddresses),
      'get node info',
      makeBackoff([1, 3, 6]),
      logger,
    );
  } finally {
    endpoint?.process?.kill();
  }
}

/**
 * Returns a client to the RPC node.
 * Tries external IP first, falls back to port-forward.
 *
 * @param env - Test environment config
 * @param forcePortForward - If true, skip external IP and use port-forward directly
 */
export async function getNodeClient(
  env: TestConfig,
  forcePortForward?: boolean,
): Promise<{ node: ReturnType<typeof createAztecNodeClient>; url: string; process?: ChildProcess }> {
  const namespace = env.NAMESPACE;

  const endpoint = await getRPCEndpoint(namespace, forcePortForward);
  await retry(
    () => fetch(`${endpoint.url}/status`).then(res => res.status === 200),
    'check RPC endpoint',
    makeBackoff([1, 1, 2, 6]),
    logger,
    true,
  );
  const client = createAztecNodeClient(endpoint.url);
  return { node: client, url: endpoint.url, process: endpoint.process };
}
