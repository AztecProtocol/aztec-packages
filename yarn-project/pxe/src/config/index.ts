import {
  type ConfigMappingsType,
  booleanConfigHelper,
  enumConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  parseBooleanEnv,
} from '@aztec/foundation/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';

export { getPackageInfo } from './package_info.js';

/**
 * Maximum number of apps that can be batched into a single private kernel iteration.
 * Aligned with the available `init_K` / `inner_K` variants.
 */
export type MaxBatchSize = 1 | 2 | 3;

/**
 * Reads `PXE_KERNEL_BATCH_SIZE` and returns a valid `MaxBatchSize`. Defaults to 1 (current
 * single-app-per-kernel behaviour) when unset. Throws on values outside {1, 2, 3} so a
 * misconfigured environment fails fast.
 */
export function parseKernelBatchSize(): MaxBatchSize {
  const raw = process.env.PXE_KERNEL_BATCH_SIZE;
  if (raw === undefined || raw === '') {
    return 1;
  }
  const parsed = Number(raw);
  if (parsed !== 1 && parsed !== 2 && parsed !== 3) {
    throw new Error(`PXE_KERNEL_BATCH_SIZE must be 1, 2, or 3 (got: ${raw}).`);
  }
  return parsed;
}

/**
 * Configuration settings for the prover factory
 */
export interface KernelProverConfig {
  /** Whether we are running with real proofs */
  proverEnabled?: boolean;
}

/**
 * Configuration settings for the block synchronizer.
 */
export interface BlockSynchronizerConfig {
  /** Maximum amount of blocks to pull from the stream in one request when synchronizing */
  l2BlockBatchSize: number;
  /** Which chain tip to sync to (proposed, checkpointed, proven, finalized) */
  syncChainTip?: 'proposed' | 'checkpointed' | 'proven' | 'finalized';
}

export type PXEConfig = KernelProverConfig & DataStoreConfig & ChainConfig & BlockSynchronizerConfig;

export type CliPXEOptions = {
  /** Custom Aztec Node URL to connect to  */
  nodeUrl?: string;
};

export const pxeConfigMappings: ConfigMappingsType<PXEConfig> = {
  ...dataConfigMappings,
  ...chainConfigMappings,
  l2BlockBatchSize: {
    env: 'PXE_L2_BLOCK_BATCH_SIZE',
    ...numberConfigHelper(50),
    description: 'Maximum amount of blocks to pull from the stream in one request when synchronizing',
  },
  // TODO: We're losing this feature in moving to bb.js api.
  // Reimplement it as a setting that dumps the msgpack data on the bb.js backend if needed.
  // bbSkipCleanup: {
  //   env: 'BB_SKIP_CLEANUP',
  //   description: 'True to skip cleanup of temporary files for debugging purposes',
  //   ...booleanConfigHelper(),
  // },
  proverEnabled: {
    env: 'PXE_PROVER_ENABLED',
    description: 'Enable real proofs',
    ...booleanConfigHelper(true),
  },
  syncChainTip: {
    env: 'PXE_SYNC_CHAIN_TIP',
    description: 'Which chain tip to sync to (proposed, checkpointed, proven, finalized)',
    ...enumConfigHelper(['proposed', 'checkpointed', 'proven', 'finalized'], 'proposed'),
  },
};

/**
 * Creates an instance of PXEConfig out of environment variables using sensible defaults for integration testing if not set.
 */
export function getPXEConfig(): PXEConfig {
  return getConfigFromMappings<PXEConfig>(pxeConfigMappings);
}

export const pxeCliConfigMappings: ConfigMappingsType<CliPXEOptions> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'Custom Aztec Node URL to connect to',
  },
};

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
 * Creates an instance of CliPxeOptions out of environment variables
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
