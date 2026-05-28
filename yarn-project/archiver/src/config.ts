import { type BlobClientConfig, blobClientConfigMapping } from '@aztec/blob-client/client/config';
import { type L1ContractsConfig, l1ContractsConfigMappings } from '@aztec/ethereum/config';
import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import {
  type ChainConfig,
  type PipelineConfig,
  chainConfigMappings,
  pipelineConfigMappings,
} from '@aztec/stdlib/config';
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
  PipelineConfig & // required to pass through to epoch cache
  BlobClientConfig &
  ChainConfig;

export const archiverConfigMappings: ConfigMappingsType<ArchiverConfig> = {
  ...blobClientConfigMapping,
  ...pipelineConfigMappings,
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
  archiverStoreMapSizeKb: {
    env: 'ARCHIVER_STORE_MAP_SIZE_KB',
    ...optionalNumberConfigHelper(),
    description: 'The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb.',
  },
  skipValidateCheckpointAttestations: {
    description: 'Skip validating checkpoint attestations (for testing purposes only)',
    ...booleanConfigHelper(false),
  },
  skipPromoteProposedCheckpointDuringL1Sync: {
    description: 'Skip promoting proposed checkpoints during L1 sync (for testing purposes only)',
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
  archiverSkipHistoricalLogsCheck: {
    env: 'ARCHIVER_SKIP_HISTORICAL_LOGS_CHECK',
    description:
      'Skip the startup check that probes the L1 RPC for historical Rollup contract logs. ' +
      'Set to true to bypass the check when the connected RPC node is known to prune old logs.',
    ...booleanConfigHelper(false),
  },
  orphanProposedBlockPruneGraceSeconds: {
    env: 'ARCHIVER_ORPHAN_PROPOSED_BLOCK_PRUNE_GRACE_SECONDS',
    description:
      'Grace period in seconds, measured from the end of a proposed block build slot, after which a ' +
      'proposed block with no matching proposed checkpoint is pruned as an orphan. Defaults from the ' +
      'sequencer block duration at the node wiring layer when unset.',
    ...optionalNumberConfigHelper(),
  },
  ...chainConfigMappings,
  ...l1ReaderConfigMappings,
  viemPollingIntervalMS: {
    env: 'ARCHIVER_VIEM_POLLING_INTERVAL_MS',
    description: 'The polling interval viem uses in ms',
    ...numberConfigHelper(1000),
  },
  ...l1ContractsConfigMappings,
};

/**
 * Returns the archiver configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The archiver configuration.
 */
export function getArchiverConfigFromEnv(): ArchiverConfig {
  return getConfigFromMappings<ArchiverConfig>(archiverConfigMappings);
}

/** Extracts the archiver-specific configuration from the full ArchiverConfig */
export function mapArchiverConfig(config: Partial<ArchiverConfig>) {
  return {
    pollingIntervalMs: config.archiverPollingIntervalMS,
    batchSize: config.archiverBatchSize,
    skipValidateCheckpointAttestations: config.skipValidateCheckpointAttestations,
    skipPromoteProposedCheckpointDuringL1Sync: config.skipPromoteProposedCheckpointDuringL1Sync,
    maxAllowedEthClientDriftSeconds: config.maxAllowedEthClientDriftSeconds,
    ethereumAllowNoDebugHosts: config.ethereumAllowNoDebugHosts,
    skipHistoricalLogsCheck: config.archiverSkipHistoricalLogsCheck,
    orphanProposedBlockPruneGraceSeconds: config.orphanProposedBlockPruneGraceSeconds,
  };
}
