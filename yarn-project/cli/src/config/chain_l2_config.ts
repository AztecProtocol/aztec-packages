import type { NetworkNames } from '@aztec/foundation/config';

import path from 'path';

import { devnetConfig, mainnetConfig, testnetConfig } from './generated/networks.js';

type NetworkConfigEnv = Record<string, string | number | boolean>;

const NetworkConfigs: Partial<Record<NetworkNames, NetworkConfigEnv>> = {
  devnet: devnetConfig,
  testnet: testnetConfig,
  mainnet: mainnetConfig,
};

function getDefaultDataDir(networkName: NetworkNames): string {
  return path.join(process.env.HOME || '~', '.aztec', networkName, 'data');
}

/**
 * Returns the generated spartan defaults for the given network as a string-keyed env var map,
 * suitable as the `envSource` argument to `envToTyped`. Includes a DATA_DIRECTORY default.
 * For 'local', returns an empty map (local defaults come from the mapping `defaultValue` fields).
 *
 * NOTE: generated network config will be removed and we'll be fetching directly from L1
 */
export function getChainConfigLayer(networkName: NetworkNames): Record<string, string> {
  if (networkName === 'local') {
    return {};
  }

  // Apply generated network config from defaults.yml
  // For devnet iterations (v4-devnet-1, etc.), use the base devnet config
  const configKey = /^v\d+-devnet-\d+$/.test(networkName) ? 'devnet' : networkName;
  const generatedConfig = NetworkConfigs[configKey];

  const result: Record<string, string> = {};
  if (generatedConfig) {
    for (const [key, value] of Object.entries(generatedConfig)) {
      result[key] = String(value);
    }
  }

  // Provide a network-specific DATA_DIRECTORY default (lower priority than explicit env).
  result['DATA_DIRECTORY'] = getDefaultDataDir(networkName);

  return result;
}
