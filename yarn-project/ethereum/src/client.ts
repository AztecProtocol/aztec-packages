import { type Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { createPublicClient, http } from 'viem';

import { createEthereumChain } from './chain.js';
import { type ViemPublicClient } from './types.js';

type Config = {
  /** The RPC Url of the ethereum host. */
  l1RpcUrl: string;
  /** The chain ID of the ethereum host. */
  l1ChainId: number;
  /** The polling interval viem uses in ms */
  viemPollingIntervalMS?: number;
};

// TODO: Use these methods to abstract the creation of viem clients.

/** Returns a viem public client given the L1 config. */
export function getPublicClient(config: Config): ViemPublicClient {
  const chain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
  return createPublicClient({
    chain: chain.chainInfo,
    transport: http(chain.rpcUrl),
    pollingInterval: config.viemPollingIntervalMS,
  });
}

/** Returns a viem public client after waiting for the L1 RPC node to become available. */
export async function waitForPublicClient(config: Config, logger?: Logger): Promise<ViemPublicClient> {
  const client = getPublicClient(config);
  await waitForRpc(client, config, logger);
  return client;
}

async function waitForRpc(client: ViemPublicClient, config: Config, logger?: Logger) {
  const l1ChainId = await retryUntil(
    async () => {
      let chainId = 0;
      try {
        chainId = await client.getChainId();
      } catch (err) {
        logger?.warn(`Failed to connect to Ethereum node at ${config.l1RpcUrl}. Retrying...`);
      }
      return chainId;
    },
    `L1 RPC url at ${config.l1RpcUrl}`,
    600,
    1,
  );

  if (l1ChainId !== config.l1ChainId) {
    throw new Error(`Ethereum node at ${config.l1RpcUrl} has chain ID ${l1ChainId} but expected ${config.l1ChainId}`);
  }
}
