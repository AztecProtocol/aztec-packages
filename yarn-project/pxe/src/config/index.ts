import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type Network } from '@aztec/types/network';

/**
 * Temporary configuration until WASM can be used instead of native
 */
export interface BBProverConfig {
  bbWorkingDirectory?: string;
  bbBinaryPath?: string;
  bbSkipCleanup?: boolean;
}

/**
 * Configuration settings for the prover factory
 */
export interface KernelProverConfig {
  /** Whether we are running with real proofs */
  proverEnabled?: boolean;
}
/**
 * Configuration settings for the PXE.
 */
export interface PXEConfig {
  /** The interval to wait between polling for new blocks. */
  l2BlockPollingIntervalMS: number;
  /** L2 block to start scanning from for new accounts */
  l2StartingBlock: number;
}

export type PXEServiceConfig = PXEConfig & KernelProverConfig & BBProverConfig & DataStoreConfig;

export type CliPXEOptions = {
  /** External Aztec network to connect to. e.g. devnet */
  network?: Network;
  /** API Key required by the external network's node */
  apiKey?: string;
  /** Custom Aztec Node URL to connect to  */
  nodeUrl?: string;
};

export const pxeConfigMappings: ConfigMappingsType<PXEServiceConfig> = {
  ...dataConfigMappings,
  l2BlockPollingIntervalMS: {
    env: 'PXE_BLOCK_POLLING_INTERVAL_MS',
    description: 'The interval to wait between polling for new blocks.',
    ...numberConfigHelper(1_000),
  },
  l2StartingBlock: {
    env: 'PXE_L2_STARTING_BLOCK',
    ...numberConfigHelper(INITIAL_L2_BLOCK_NUM),
    description: 'L2 block to start scanning from for new accounts',
  },
  bbBinaryPath: {
    env: 'BB_BINARY_PATH',
    description: 'Path to the BB binary',
  },
  bbWorkingDirectory: {
    env: 'BB_WORKING_DIRECTORY',
    description: 'Working directory for the BB binary',
  },
  bbSkipCleanup: {
    env: 'BB_SKIP_CLEANUP',
    description: 'True to skip cleanup of temporary files for debugging purposes',
    ...booleanConfigHelper(),
  },
  proverEnabled: {
    env: 'PXE_PROVER_ENABLED',
    description: 'Enable real proofs',
    ...booleanConfigHelper(),
  },
};

/**
 * Creates an instance of PXEServiceConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getPXEServiceConfig(): PXEServiceConfig {
  return getConfigFromMappings<PXEServiceConfig>(pxeConfigMappings);
}

export const pxeCliConfigMappings: ConfigMappingsType<CliPXEOptions> = {
  network: {
    env: 'NETWORK',
    parseEnv: (val: string) => val as Network,
    description: 'External Aztec network to connect to. e.g. devnet',
  },
  apiKey: {
    env: 'API_KEY',
    description: "API Key required by the external network's node",
  },
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'Custom Aztec Node URL to connect to',
  },
};

export const allPxeConfigMappings: ConfigMappingsType<CliPXEOptions & PXEServiceConfig> = {
  ...pxeConfigMappings,
  ...pxeCliConfigMappings,
  ...dataConfigMappings,
  proverEnabled: {
    env: 'PXE_PROVER_ENABLED',
    parseEnv: (val: string) => ['1', 'true', 'TRUE'].includes(val) || !!process.env.NETWORK,
    description: 'Enable real proofs',
    isBoolean: true,
  },
};

/**
 * Creates an instance of CliPxeOptions out of environment variables
 */
export function getCliPXEOptions(): CliPXEOptions & PXEServiceConfig {
  const pxeConfig = getPXEServiceConfig();
  const cliOptions = getConfigFromMappings<CliPXEOptions>(pxeCliConfigMappings);
  return {
    ...pxeConfig,
    ...cliOptions,
    proverEnabled: pxeConfig.proverEnabled || !!cliOptions.network,
  };
}
