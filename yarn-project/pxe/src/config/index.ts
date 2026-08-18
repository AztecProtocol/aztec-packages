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
export * from '../hooks/index.js';

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
  /**
   * Whether PXE should automatically sync with the node before each operation (simulate, prove, profile,
   * execute utility, get private events, update contract). When disabled, callers (e.g. wallets) are
   * responsible for calling `pxe.sync()` explicitly
   */
  autoSync: boolean;
}

/**
 * Configuration settings for the contract sync service.
 */
export interface ContractSyncConfig {
  /**
   * Whether PXE speculatively syncs contracts it predicts will follow the one requested, running them concurrently
   * with it instead of waiting for execution to reach them. When enabled, repeated flows sync faster, but a wrong
   * prediction spends unnecessary node requests syncing contracts the job never uses.
   *
   * Experimental, off by default.
   */
  concurrentContractSyncEnabled: boolean;
}

export type PXEConfig = KernelProverConfig &
  DataStoreConfig &
  ChainConfig &
  BlockSynchronizerConfig &
  ContractSyncConfig;

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
  autoSync: {
    env: 'PXE_AUTO_SYNC',
    description:
      'Whether PXE syncs with the node automatically before each operation. Disable to let the caller (e.g. a wallet) drive syncs explicitly via pxe.sync().',
    ...booleanConfigHelper(true),
  },
  concurrentContractSyncEnabled: {
    env: 'PXE_CONCURRENT_CONTRACT_SYNC_ENABLED',
    description:
      'Whether PXE speculatively syncs contracts it predicts will follow the one requested, running them concurrently with it. Repeated flows sync faster, but a wrong prediction spends unnecessary node requests. Experimental, off by default.',
    ...booleanConfigHelper(false),
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
