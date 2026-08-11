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
import { type ChainConfig, type SequencerConfig, chainConfigMappings } from '@aztec/stdlib/config';
import { MAX_RPC_BLOCKS_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { ArchiverSpecificConfig } from '@aztec/stdlib/interfaces/server';
import { DEFAULT_ORPHAN_PRUNE_NO_PROPOSAL_TOLERANCE } from '@aztec/stdlib/timetable';

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
  ChainConfig &
  Pick<SequencerConfig, 'blockDurationMs' | 'checkpointProposalSyncGraceSeconds'>;

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
  archiverStoreMapSizeKb: {
    env: 'ARCHIVER_STORE_MAP_SIZE_KB',
    ...optionalNumberConfigHelper(),
    description: 'The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb.',
  },
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description:
      'Duration per block in milliseconds when building multiple blocks per slot. Used to derive orphan proposed block pruning timing.',
    ...optionalNumberConfigHelper(),
  },
  checkpointProposalSyncGraceSeconds: {
    env: 'CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS',
    description:
      'Consensus grace in seconds for a received checkpoint proposal to materialize into local proposed state.',
    ...optionalNumberConfigHelper(),
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
  orphanPruneNoProposalTolerance: {
    env: 'ARCHIVER_ORPHAN_PRUNE_NO_PROPOSAL_TOLERANCE',
    description: 'Local tolerance in seconds before pruning an orphan block when no checkpoint proposal was received.',
    ...numberConfigHelper(DEFAULT_ORPHAN_PRUNE_NO_PROPOSAL_TOLERANCE),
  },
  skipOrphanProposedBlockPruning: {
    env: 'ARCHIVER_SKIP_ORPHAN_PROPOSED_BLOCK_PRUNING',
    description: 'Skip pruning orphan proposed blocks that have no matching proposed checkpoint.',
    ...booleanConfigHelper(false),
  },
  testPreloadStandardContracts: {
    env: 'TEST_PRELOAD_STANDARD_CONTRACTS',
    description:
      'Preload the standard contracts (AuthRegistry, PublicChecks, HandshakeRegistry) into the contract store at ' +
      'block 0. For test environments only, and only safe when genesis seeds the matching registration/deployment ' +
      'nullifiers; otherwise a later on-chain publish would collide with the block-0 preload.',
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
};

/**
 * Configuration of the RPC-sync (follower) archiver. Deliberately separate from the L1 archiver knobs:
 * `archiverPollingIntervalMS`/`archiverBatchSize` describe L1 log scanning, which a follower never does.
 */
export type RpcSyncArchiverSpecificConfig = {
  /** How often the follower polls its upstream node for new chain state. */
  followerSyncPollingIntervalMs?: number;
  /** Number of L2 blocks the follower requests per upstream call. Capped at the RPC limit of 50. */
  followerSyncBatchSize?: number;
};

/** Default follower polling interval, in ms. Tracks L2 block cadence rather than L1 block cadence. */
export const DEFAULT_FOLLOWER_SYNC_POLLING_INTERVAL_MS = 1_000;

/** Default follower block batch size. Matches the `getBlocks` RPC ceiling. */
export const DEFAULT_FOLLOWER_SYNC_BATCH_SIZE = MAX_RPC_BLOCKS_LEN;

export const rpcSyncArchiverConfigMappings: ConfigMappingsType<RpcSyncArchiverSpecificConfig> = {
  followerSyncPollingIntervalMs: {
    env: 'FOLLOWER_SYNC_POLLING_INTERVAL_MS',
    description: 'How often the follower archiver polls its upstream node for new chain state.',
    ...numberConfigHelper(DEFAULT_FOLLOWER_SYNC_POLLING_INTERVAL_MS),
  },
  followerSyncBatchSize: {
    env: 'FOLLOWER_SYNC_BATCH_SIZE',
    description: 'Number of L2 blocks the follower archiver requests per upstream call. Capped at the RPC limit of 50.',
    ...numberConfigHelper(DEFAULT_FOLLOWER_SYNC_BATCH_SIZE),
  },
};

/** Extracts the follower-specific configuration, applying defaults for anything unset. */
export function mapRpcSyncArchiverConfig(config: Partial<RpcSyncArchiverSpecificConfig>) {
  return {
    pollingIntervalMs: config.followerSyncPollingIntervalMs ?? DEFAULT_FOLLOWER_SYNC_POLLING_INTERVAL_MS,
    batchSize: config.followerSyncBatchSize ?? DEFAULT_FOLLOWER_SYNC_BATCH_SIZE,
  };
}

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
    orphanPruneNoProposalTolerance: config.orphanPruneNoProposalTolerance,
    skipOrphanProposedBlockPruning: config.skipOrphanProposedBlockPruning,
  };
}
