import type { NetworkNames } from '@aztec/foundation/config';
import { createLogger } from '@aztec/foundation/log';
import { type ConsensusEnvVar, checkConsensusEnvOverrides } from '@aztec/stdlib/config';

import path from 'path';

import { devnetConfig, mainnetConfig, testnetConfig } from './generated/networks.js';

type NetworkConfigEnv = Record<string, string | number | boolean>;

const NetworkConfigs: Partial<Record<NetworkNames, NetworkConfigEnv>> = {
  devnet: devnetConfig,
  testnet: testnetConfig,
  mainnet: mainnetConfig,
};

/** Every generated network config must define every consensus-critical env var. */
type ConsensusComplete = Record<ConsensusEnvVar, string | number | boolean>;
({ devnetConfig, testnetConfig, mainnetConfig }) satisfies Record<string, ConsensusComplete>;

const log = createLogger('cli:chain_l2_config');

function enrichEnvironmentWithNetworkConfig(config: NetworkConfigEnv): void {
  for (const [key, value] of Object.entries(config)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = String(value);
    }
  }
}

function getDefaultDataDir(networkName: NetworkNames): string {
  return path.join(process.env.HOME || '~', '.aztec', networkName, 'data');
}

/**
 * Sets up environment for the given network.
 *
 * For 'local' network: returns early, using hardcoded defaults from DefaultL1ContractsConfig
 * and DefaultSlasherConfig (which match the 'defaults' section of defaults.yml).
 *
 * For deployed networks: applies network configuration from generated defaults.yml,
 * merging base defaults with network-specific overrides. Before merging, enforces that operators have not
 * overridden any consensus-critical env var with a value diverging from the network config (throwing unless
 * ALLOW_OVERRIDING_NETWORK_CONFIG is set), so all nodes of a network agree on consensus-critical values.
 *
 * @param networkName - The network name
 */
export function enrichEnvironmentWithChainName(networkName: NetworkNames) {
  // For 'local', we don't inject any env vars - use hardcoded TypeScript/Solidity defaults
  // These defaults are defined in defaults.yml 'defaults' section and match:
  // - DefaultL1ContractsConfig (yarn-project/ethereum/src/config.ts)
  // - Solidity vm.envOr defaults (l1-contracts/script/deploy/RollupConfiguration.sol)
  if (networkName === 'local') {
    return;
  }

  // Apply generated network config from defaults.yml
  // For devnet iterations (v4-devnet-1, etc.), use the base devnet config
  const configKey = /^v\d+-devnet-\d+$/.test(networkName) ? 'devnet' : networkName;
  const generatedConfig = NetworkConfigs[configKey];
  if (generatedConfig) {
    checkConsensusEnvOverrides(generatedConfig, process.env, msg => log.warn(msg));
    enrichEnvironmentWithNetworkConfig(generatedConfig);
  }

  // Set DATA_DIRECTORY if not already set
  if (process.env['DATA_DIRECTORY'] === undefined) {
    process.env['DATA_DIRECTORY'] = getDefaultDataDir(networkName);
  }
}
