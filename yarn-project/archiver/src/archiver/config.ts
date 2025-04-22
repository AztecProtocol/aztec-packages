import { type BlobSinkConfig, blobSinkConfigMapping } from '@aztec/blob-sink/client';
import {
  type L1ContractAddresses,
  type L1ContractsConfig,
  type L1ReaderConfig,
  l1ContractAddressesMapping,
  l1ContractsConfigMappings,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';

/**
 * There are 2 polling intervals used in this configuration. The first is the archiver polling interval, archiverPollingIntervalMS.
 * This is the interval between successive calls to eth_blockNumber via viem.
 * Results of calls to eth_blockNumber are cached by viem with this cache being updated periodically at the interval specified by viemPollingIntervalMS.
 * As a result the maximum observed polling time for new blocks will be viemPollingIntervalMS + archiverPollingIntervalMS.
 */

/**
 * The archiver configuration.
 */
export type ArchiverConfig = {
  /** URL for an archiver service. If set, will return an archiver client as opposed to starting a new one. */
  archiverUrl?: string;

  /** List of URLS for L1 consensus clients */
  l1ConsensusHostUrls?: string[];

  /** The polling interval in ms for retrieving new L2 blocks and encrypted logs. */
  archiverPollingIntervalMS?: number;

  /** The number of L2 blocks the archiver will attempt to download at a time. */
  archiverBatchSize?: number;

  /** The polling interval viem uses in ms */
  viemPollingIntervalMS?: number;

  /** The deployed L1 contract addresses */
  l1Contracts: L1ContractAddresses;

  /** The max number of logs that can be obtained in 1 "getPublicLogs" call. */
  maxLogs?: number;

  /** The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB. */
  archiverStoreMapSizeKb?: number;
} & L1ReaderConfig &
  L1ContractsConfig &
  BlobSinkConfig &
  ChainConfig;

export const archiverConfigMappings: ConfigMappingsType<ArchiverConfig> = {
  ...blobSinkConfigMapping,
  archiverUrl: {
    env: 'ARCHIVER_URL',
    description:
      'URL for an archiver service. If set, will return an archiver client as opposed to starting a new one.',
  },
  l1ConsensusHostUrls: {
    env: 'L1_CONSENSUS_HOST_URLS',
    description: 'List of URLS for L1 consensus clients.',
    parseEnv: (val: string) => val.split(',').map(url => url.trim().replace(/\/$/, '')),
  },
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
