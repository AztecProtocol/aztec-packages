import { type BlobSinkConfig, blobSinkConfigMapping } from '@aztec/blob-sink/client';
import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  l1ContractAddressesMapping,
  l1ContractsConfigMappings,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';
import type { ArchiverSpecificConfig } from '@aztec/stdlib/interfaces/server';

/**
 * The archiver configuration.
 * There are 2 polling intervals used in this configuration. The first is the archiver polling interval, archiverPollingIntervalMS.
 * This is the interval between successive calls to eth_blockNumber via viem.
 * Results of calls to eth_blockNumber are cached by viem with this cache being updated periodically at the interval specified by viemPollingIntervalMS.
 * As a result the maximum observed polling time for new blocks will be viemPollingIntervalMS + archiverPollingIntervalMS.
 */
export type ArchiverConfig = ArchiverSpecificConfig & L1ReaderConfig & L1ContractsConfig & BlobSinkConfig & ChainConfig;

export const archiverConfigMappings: ConfigMappingsType<ArchiverConfig> = {
  ...blobSinkConfigMapping,
  archiverPollingIntervalMS: {
    env: 'ARCHIVER_POLLING_INTERVAL_MS',
    description: 'The polling interval in ms for retrieving new L2 blocks and encrypted logs.',
    ...numberConfigHelper(500),
  },
  archiverBatchSize: {
    env: 'ARCHIVER_BATCH_SIZE',
    description: 'The number of L2 blocks the archiver will attempt to download at a time.',
    ...numberConfigHelper(100),
  },
  maxLogs: {
    env: 'ARCHIVER_MAX_LOGS',
    description: 'The max number of logs that can be obtained in 1 "getPublicLogs" call.',
    ...numberConfigHelper(1_000),
  },
  archiverStoreMapSizeKb: {
    env: 'ARCHIVER_STORE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB.',
  },
  skipValidateBlockAttestations: {
    description: 'Whether to skip validating block attestations (use only for testing).',
    ...booleanConfigHelper(false),
  },
  ...chainConfigMappings,
  ...l1ReaderConfigMappings,
  viemPollingIntervalMS: {
    env: 'ARCHIVER_VIEM_POLLING_INTERVAL_MS',
    description: 'The polling interval viem uses in ms',
    ...numberConfigHelper(1000),
  },
  ...l1ContractsConfigMappings,
  l1Contracts: {
    description: 'The deployed L1 contract addresses',
    nested: l1ContractAddressesMapping,
  },
};

/**
 * Returns the archiver configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The archiver configuration.
 */
export function getArchiverConfigFromEnv(): ArchiverConfig {
  return getConfigFromMappings<ArchiverConfig>(archiverConfigMappings);
}
