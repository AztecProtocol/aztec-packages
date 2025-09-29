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
  /** List of URLs of Ethereum RPC nodes that services will connect to (comma separated). */
  l1RpcUrls: string[];
  /** The chain ID of the ethereum host. */
  l1ChainId: number;
  /** The polling interval viem uses in ms */
  viemPollingIntervalMS?: number;
};

export type { Config as EthereumClientConfig };

/** Build robust HTTP transports with sensible fallbacks (adds public Sepolia RPCs if needed). */
function buildTransports(urls: string[], chainId: number) {
  // Normalize & de-duplicate by origin
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const u of urls || []) {
    try {
      const origin = new URL(u).origin;
      if (!seen.has(origin)) {
        seen.add(origin);
        normalized.push(u);
      }
    } catch {
      // If URL constructor fails, keep raw but still dedupe by string
      if (!seen.has(u)) {
        seen.add(u);
        normalized.push(u);
      }
    }
  }

  // If Sepolia (11155111), ensure we have at least two public fallbacks
  if (chainId === 11155111) {
    const publicCandidates = [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://rpc.sepolia.org',
    ];
    for (const p of publicCandidates) {
      const origin = (() => {
        try {
          return new URL(p).origin;
        } catch {
          return p;
        }
      })();
      if (!seen.has(origin)) {
        seen.add(origin);
        normalized.push(p);
      }
    }
  }

  // Map to viem http transports
  return normalized.map(u => http(u));
}

// TODO: Use these methods to abstract the creation of viem clients.

/** Returns a viem public client given the L1 config. */
export function getPublicClient(config: Config): ViemPublicClient {
  const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  const transports = buildTransports(config.l1RpcUrls, config.l1ChainId);

  return createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(transports, {
      rank: true,        // prefer faster / healthier endpoints
      retryCount: 3,
      retryDelay: 400,   // ms
    }),
    pollingInterval: config.viemPollingIntervalMS,
    batch: { multicall: true },
  });
}

/**
 * Optional helper: wrap getTransactionReceipt to normalize DRPC 403/429 into a single error code.
 * Callers can catch `e.message === "rpc_rate_limited"` to show a friendly UI message.
 */
export async function getTransactionReceiptSafe(
  client: ViemPublicClient,
  hash: `0x${string}`,
) {
  try {
    return await client.getTransactionReceipt({ hash });
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    const status = (e as any)?.status;
    // DRPC: 403 "User balance exceeded" (code 10) or generic 429/403 from any provider
    if (msg.toLowerCase().includes('balance exceeded') || status === 403 || status === 429) {
      const err = new Error('rpc_rate_limited');
      (err as any).cause = e;
      throw err;
    }
    throw e;
  }
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

  const transports = buildTransports(rpcUrls, chain.id ?? 0);

  const extendedClient = createWalletClient({
    account: hdAccount,
    chain,
    transport: fallback(transports, {
      rank: true,
      retryCount: 3,
      retryDelay: 400,
    }),
    pollingInterval: pollingIntervalMS,
  }).extend(publicActions);

  return extendedClient;
}
