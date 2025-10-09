import { type NetworkConfig, NetworkConfigMapSchema, type NetworkNames } from '@aztec/foundation/config';

import { readFile } from 'fs/promises';
import { join } from 'path';

import { cachedFetch } from './cached_fetch.js';
import { enrichEthAddressVar, enrichVar } from './enrich_env.js';

const DEFAULT_CONFIG_URL =
  'https://raw.githubusercontent.com/AztecProtocol/networks/refs/heads/main/network_config.json';
const NETWORK_CONFIG_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches remote network configuration from GitHub with caching support.
 * Uses the reusable cachedFetch utility.
 *
 * @param networkName - The network name to fetch config for
 * @param cacheDir - Optional cache directory for storing fetched config
 * @returns Remote configuration for the specified network, or undefined if not found/error
 */
export async function getNetworkConfig(
  networkName: NetworkNames,
  cacheDir?: string,
): Promise<NetworkConfig | undefined> {
  let url: URL | undefined;
  const configLocation = process.env.NETWORK_CONFIG_LOCATION || DEFAULT_CONFIG_URL;

  if (!configLocation) {
    return undefined;
  }

  try {
    if (configLocation.includes('://')) {
      url = new URL(configLocation);
    } else {
      url = new URL(`file://${configLocation}`);
    }
  } catch {
    /* no-op */
  }

  if (!url) {
    return undefined;
  }

  try {
    let rawConfig: any;

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      rawConfig = await cachedFetch(url.href, {
        cacheDurationMs: NETWORK_CONFIG_CACHE_DURATION_MS,
        cacheFile: cacheDir ? join(cacheDir, networkName, 'network_config.json') : undefined,
      });
    } else if (url.protocol === 'file:') {
      rawConfig = JSON.parse(await readFile(url.pathname, 'utf-8'));
    } else {
      throw new Error('Unsupported Aztec network config protocol: ' + url.href);
    }

    if (!rawConfig) {
      return undefined;
    }

    const networkConfigMap = NetworkConfigMapSchema.parse(rawConfig);
    if (networkName in networkConfigMap) {
      return networkConfigMap[networkName];
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Enriches environment variables with remote network configuration.
 * This function is called before node config initialization to set env vars
 * from the remote config, following the same pattern as enrichEnvironmentWithChainConfig().
 *
 * @param networkName - The network name to fetch remote config for
 */
export async function enrichEnvironmentWithNetworkConfig(networkName: NetworkNames) {
  if (networkName === 'local') {
    return; // No remote config for local development
  }

  const cacheDir = process.env.DATA_DIRECTORY ? join(process.env.DATA_DIRECTORY, 'cache') : undefined;
  const networkConfig = await getNetworkConfig(networkName, cacheDir);

  if (!networkConfig) {
    return;
  }

  enrichVar('BOOTSTRAP_NODES', networkConfig.bootnodes.join(','));
  enrichVar('L1_CHAIN_ID', String(networkConfig.l1ChainId));
  enrichVar('SYNC_SNAPSHOTS_URLS', networkConfig.snapshots.join(','));

  enrichEthAddressVar('REGISTRY_CONTRACT_ADDRESS', networkConfig.registryAddress.toString());
  if (networkConfig.feeAssetHandlerAddress) {
    enrichEthAddressVar('FEE_ASSET_HANDLER_CONTRACT_ADDRESS', networkConfig.feeAssetHandlerAddress.toString());
  }
}
