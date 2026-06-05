import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { getErrorCause } from '@aztec/foundation/types';

import {
  type Chain,
  type FallbackTransport,
  type HDAccount,
  HttpRequestError,
  type HttpTransport,
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
  /** Timeout for HTTP requests to the L1 RPC node in ms. */
  l1HttpTimeoutMS?: number;
};

export type { Config as EthereumClientConfig };

/** Error exposed by L1 RPC transports without including provider URLs in its message. */
export class L1RpcError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'L1RpcError';
  }
}

/** Creates a viem fallback HTTP transport for the given L1 RPC URLs. */
export function makeL1HttpTransport(rpcUrls: string[], opts?: { timeout?: number }) {
  return wrapL1RpcTransport(fallback(rpcUrls.map(url => http(url, { batch: false, timeout: opts?.timeout }))));
}

/** Returns the HTTP status from an L1 RPC error's cause chain, if one is available. */
export function getL1RpcHttpStatus(err: unknown): number | undefined {
  return getErrorCause(err, HttpRequestError)?.status;
}

/** Returns true when an L1 RPC error's cause chain contains the given HTTP status. */
export function isL1RpcHttpStatus(err: unknown, status: number): boolean {
  return getL1RpcHttpStatus(err) === status;
}

function wrapL1RpcTransport(transport: FallbackTransport<HttpTransport[]>): FallbackTransport<HttpTransport[]> {
  const wrappedTransport: FallbackTransport<HttpTransport[]> = parameters => {
    const fallbackTransport = transport(parameters);
    const request: typeof fallbackTransport.request = async args => {
      try {
        return await fallbackTransport.request(args);
      } catch (err) {
        throw err instanceof L1RpcError ? err : new L1RpcError('L1 RPC request failed', { cause: err });
      }
    };
    return { ...fallbackTransport, request };
  };

  return wrappedTransport;
}

/**
 * Returns the individual RPC URLs underlying a viem public client that was constructed with a
 * fallback HTTP transport (see {@link makeL1HttpTransport}). Returns an empty array if the
 * transport shape is not recognized (e.g. mock clients in tests, or non-fallback transports).
 */
export function getRpcUrlsFromClient(client: ViemPublicClient): string[] {
  const transport = client.transport as unknown as {
    transports?: { value?: { url?: string } }[];
    value?: { url?: string };
    url?: string;
  };
  if (Array.isArray(transport?.transports)) {
    return transport.transports.map(t => t?.value?.url).filter((url): url is string => typeof url === 'string');
  }
  const singleUrl = transport?.value?.url ?? transport?.url;
  return typeof singleUrl === 'string' ? [singleUrl] : [];
}

// TODO: Use these methods to abstract the creation of viem clients.

/** Returns a viem public client given the L1 config. */
export function getPublicClient(config: Config): ViemPublicClient {
  const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  return createPublicClient({
    chain: chain.chainInfo,
    transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
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
  opts?: { httpTimeoutMS?: number },
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
    transport: makeL1HttpTransport(rpcUrls, { timeout: opts?.httpTimeoutMS }),
    pollingInterval: pollingIntervalMS,
  }).extend(publicActions);

  return extendedClient;
}
