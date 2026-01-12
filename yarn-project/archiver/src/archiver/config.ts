import { type BlobClientConfig, blobClientConfigMapping } from '@aztec/blob-client/client/config';
import { type L1ContractsConfig, l1ContractsConfigMappings } from '@aztec/ethereum/config';
import { l1ContractAddressesMapping } from '@aztec/ethereum/l1-contract-addresses';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
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
export type ArchiverConfig = ArchiverSpecificConfig &
  L1ReaderConfig &
  L1ContractsConfig &
  BlobClientConfig &
  ChainConfig;

export const archiverConfigMappings: ConfigMappingsType<ArchiverConfig> = {
  ...blobClientConfigMapping,
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
    description: 'The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb.',
  },
  skipValidateCheckpointAttestations: {
    description: 'Skip validating checkpoint attestations (for testing purposes only)',
    ...booleanConfigHelper(false),
  },
  maxAllowedEthClientDriftSeconds: {
    env: 'MAX_ALLOWED_ETH_CLIENT_DRIFT_SECONDS',
    description: 'Maximum allowed drift in seconds between the Ethereum client and current time.',
    ...numberConfigHelper(300),
  },
  ethereumAllowNoDebugHosts: {
    env: 'ETHEREUM_ALLOW_NO_DEBUG_HOSTS',
    description: 'Whether to allow starting the archiver without debug/trace method support on Ethereum hosts',
    ...booleanConfigHelper(true),
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
