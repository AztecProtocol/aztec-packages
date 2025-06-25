import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  parseBooleanEnv,
} from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';

export { getPackageInfo } from './package_info.js';

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
  /** Maximum amount of blocks to pull from the stream in one request when synchronizing */
  l2BlockBatchSize: number;
}

export type PXEServiceConfig = PXEConfig & KernelProverConfig & BBProverConfig & DataStoreConfig & ChainConfig;

export type CliPXEOptions = {
  /** Custom Aztec Node URL to connect to  */
  nodeUrl?: string;
};

export const pxeConfigMappings: ConfigMappingsType<PXEServiceConfig> = {
  ...dataConfigMappings,
  ...chainConfigMappings,
  l2BlockBatchSize: {
    env: 'PXE_L2_BLOCK_BATCH_SIZE',
    ...numberConfigHelper(200),
    description: 'Maximum amount of blocks to pull from the stream in one request when synchronizing',
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
    ...booleanConfigHelper(true),
  },
};

/**
 * Creates an instance of PXEServiceConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getPXEServiceConfig(): PXEServiceConfig {
  return getConfigFromMappings<PXEServiceConfig>(pxeConfigMappings);
}

export const pxeCliConfigMappings: ConfigMappingsType<CliPXEOptions> = {
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
    parseEnv: (val: string) => parseBooleanEnv(val) || !!process.env.NETWORK,
    description: 'Enable real proofs',
    isBoolean: true,
    defaultValue: true,
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
    proverEnabled: pxeConfig.proverEnabled,
  };
}
