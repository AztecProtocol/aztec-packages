import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import {
  type Chain,
  type HDAccount,
  type LocalAccount,
  type PrivateKeyAccount,
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  publicActions,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createEthereumChain } from './chain.js';
import type { ExtendedViemWalletClient, ViemPublicClient } from './types.js';

type Config = {
  /** The RPC Url of the ethereum host. */
  l1RpcUrls: string[];
  /** The chain ID of the ethereum host. */
  l1ChainId: number;
  /** The polling interval viem uses in ms */
  viemPollingIntervalMS?: number;
};

export type { Config as EthereumClientConfig };

// TODO: Use these methods to abstract the creation of viem clients.

/** Returns a viem public client given the L1 config. */
export function getPublicClient(config: Config): ViemPublicClient {
  const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  return createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(config.l1RpcUrls.map(url => http(url))),
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
      } catch {
        logger?.warn(`Failed to connect to Ethereum node at ${config.l1RpcUrls.join(', ')}. Retrying...`);
      }
      return chainId;
    },
    `L1 RPC url at ${config.l1RpcUrls.join(', ')}`,
    600,
    1,
  );

  if (l1ChainId !== config.l1ChainId) {
    throw new Error(
      `Ethereum node at ${config.l1RpcUrls.join(', ')} has chain ID ${l1ChainId} but expected ${config.l1ChainId}`,
    );
  }
}

export function createExtendedL1Client(
  rpcUrls: string[],
  mnemonicOrPrivateKeyOrHdAccount: string | HDAccount | PrivateKeyAccount | LocalAccount,
  chain: Chain = foundry,
  pollingIntervalMS?: number,
  addressIndex?: number,
): ExtendedViemWalletClient {
  const hdAccount =
    typeof mnemonicOrPrivateKeyOrHdAccount === 'string'
      ? mnemonicOrPrivateKeyOrHdAccount.startsWith('0x')
        ? privateKeyToAccount(mnemonicOrPrivateKeyOrHdAccount as `0x${string}`)
        : mnemonicToAccount(mnemonicOrPrivateKeyOrHdAccount, { addressIndex })
      : mnemonicOrPrivateKeyOrHdAccount;

  const extendedClient = createWalletClient({
    account: hdAccount,
    chain,
    transport: fallback(rpcUrls.map(url => http(url))),
    pollingInterval: pollingIntervalMS,
  }).extend(publicActions);

  return extendedClient;
}
