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
 * Configuration for the BB (Barretenberg) native prover.
 *
 * @remarks
 * This configuration is temporary while WASM-based proving is under development.
 * The BB prover is the native C++ implementation that generates cryptographic proofs
 * for Aztec transactions. These settings control where the binary is located and
 * how it manages temporary files during proof generation.
 */
export interface BBProverConfig {
  /** Directory where BB stores temporary files during proof generation */
  bbWorkingDirectory?: string;
  /** Path to the BB binary executable */
  bbBinaryPath?: string;
  /** If true, preserve temporary files after proof generation for debugging */
  bbSkipCleanup?: boolean;
}

/**
 * Configuration for kernel proving in the PXE.
 *
 * @remarks
 * The kernel prover generates zero-knowledge proofs for private transaction execution.
 * This configuration controls whether real cryptographic proofs are generated or
 * whether the PXE runs in a mock mode for faster development and testing.
 */
export interface KernelProverConfig {
  /**
   * Whether to generate real cryptographic proofs.
   * @remarks
   * When true, the PXE generates full zero-knowledge proofs for transactions, which
   * is required for production use but slower. When false, the PXE runs in mock mode,
   * which is much faster but not suitable for production.
   */
  proverEnabled?: boolean;
}

/**
 * Configuration for the PXE synchronizer.
 *
 * @remarks
 * The synchronizer keeps the PXE in sync with the Aztec network by fetching and
 * processing new blocks. These settings control how blocks are fetched and processed.
 */
export interface SynchronizerConfig {
  /**
   * Maximum number of blocks to fetch in a single batch.
   * @remarks
   * Larger batch sizes can improve sync performance but increase memory usage and
   * network load. Smaller batches are more resilient to network interruptions but
   * may sync more slowly. The default of 50 provides a good balance for most cases.
   */
  l2BlockBatchSize: number;
}

/**
 * Complete PXE configuration combining all configuration categories.
 *
 * @remarks
 * This type merges configuration from multiple domains:
 * - KernelProverConfig: Proving settings
 * - BBProverConfig: Native prover binary settings
 * - DataStoreConfig: Database and storage settings
 * - ChainConfig: Aztec network and chain settings
 * - SynchronizerConfig: Block synchronization settings
 *
 * All fields are optional to allow partial configuration with defaults.
 */
export type PXEConfig = KernelProverConfig & BBProverConfig & DataStoreConfig & ChainConfig & SynchronizerConfig;

/**
 * Command-line specific options for the PXE CLI.
 *
 * @remarks
 * These options are specific to running the PXE as a standalone service via the CLI,
 * as opposed to embedding the PXE in another application. The CLI options primarily
 * control connectivity to external services.
 */
export type CliPXEOptions = {
  /**
   * URL of the Aztec Node to connect to.
   * @remarks
   * The PXE requires connection to an Aztec Node to fetch blocks, broadcast transactions,
   * and query network state. If not specified, defaults to a local node URL.
   */
  nodeUrl?: string;
};

/**
 * Environment variable mappings for PXE configuration.
 *
 * @remarks
 * This object defines how environment variables map to PXE configuration fields.
 * Each field specifies:
 * - env: The environment variable name
 * - description: Human-readable description for documentation
 * - Helper functions for parsing and default values
 *
 * Used by getConfigFromMappings to load configuration from the environment.
 */
export const pxeConfigMappings: ConfigMappingsType<PXEConfig> = {
  ...dataConfigMappings,
  ...chainConfigMappings,
  l2BlockBatchSize: {
    env: 'PXE_L2_BLOCK_BATCH_SIZE',
    ...numberConfigHelper(50),
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
 * Loads PXE configuration from environment variables.
 *
 * @returns A PXEConfig object with values from environment variables or defaults
 * @remarks
 * This function reads environment variables according to pxeConfigMappings and constructs
 * a complete PXEConfig object. For any settings not specified in the environment, sensible
 * defaults are used that are appropriate for integration testing and development.
 *
 * The function handles type conversion (strings to numbers/booleans) and validation
 * automatically based on the mapping definitions.
 */
export function getPXEConfig(): PXEConfig {
  return getConfigFromMappings<PXEConfig>(pxeConfigMappings);
}

/**
 * Environment variable mappings for PXE CLI-specific options.
 *
 * @remarks
 * Similar to pxeConfigMappings but for CLI-specific options like node URL.
 * These are separate because they're only relevant when running the PXE as a
 * standalone service, not when embedding it in another application.
 */
export const pxeCliConfigMappings: ConfigMappingsType<CliPXEOptions> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'Custom Aztec Node URL to connect to',
  },
};

/**
 * Combined environment variable mappings for PXE and CLI options.
 *
 * @remarks
 * This merges pxeConfigMappings and pxeCliConfigMappings with special handling for
 * the proverEnabled setting. The proverEnabled default is context-aware:
 * - If NETWORK environment variable is set, defaults to true (production mode)
 * - Otherwise defaults to the base configuration value
 *
 * This is used by the CLI to load complete configuration including both PXE-specific
 * and CLI-specific settings in one operation.
 */
export const allPxeConfigMappings: ConfigMappingsType<CliPXEOptions & PXEConfig> = {
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
 * Loads complete CLI PXE configuration from environment variables.
 *
 * @returns Combined PXE and CLI configuration
 * @remarks
 * This function loads both PXE-specific configuration (proving, storage, sync) and
 * CLI-specific configuration (node URL) from environment variables. It's the main
 * entry point for configuring the PXE when running as a standalone CLI service.
 *
 * The returned configuration combines:
 * - Base PXE configuration (from getPXEConfig)
 * - CLI-specific options (from pxeCliConfigMappings)
 * - Special proverEnabled handling based on NETWORK environment variable
 */
export function getCliPXEOptions(): CliPXEOptions & PXEConfig {
  const pxeConfig = getPXEConfig();
  const cliOptions = getConfigFromMappings<CliPXEOptions>(pxeCliConfigMappings);
  return {
    ...pxeConfig,
    ...cliOptions,
    proverEnabled: pxeConfig.proverEnabled,
  };
}
