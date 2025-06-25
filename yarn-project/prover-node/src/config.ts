import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import type { ACVMConfig, BBConfig } from '@aztec/bb-prover/config';
import { type GenesisStateConfig, genesisStateConfigMappings, getAddressFromPrivateKey } from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type SharedNodeConfig, sharedNodeConfigMappings } from '@aztec/node-lib/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import {
  type ProverAgentConfig,
  type ProverBrokerConfig,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
} from '@aztec/prover-client/broker';
import {
  type ProverClientConfig,
  type ProverClientUserConfig,
  bbConfigMappings,
  proverClientConfigMappings,
} from '@aztec/prover-client/config';
import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigMappings,
  getTxSenderConfigMappings,
} from '@aztec/sequencer-client/config';
import { type WorldStateConfig, worldStateConfigMappings } from '@aztec/world-state/config';

import { type ProverCoordinationConfig, proverCoordinationConfigMappings } from './prover-coordination/config.js';

export type ProverNodeConfig = ArchiverConfig &
  ProverClientUserConfig &
  P2PConfig &
  WorldStateConfig &
  PublisherConfig &
  TxSenderConfig &
  DataStoreConfig &
  ProverCoordinationConfig &
  SharedNodeConfig &
  SpecificProverNodeConfig &
  GenesisStateConfig;

export type SpecificProverNodeConfig = {
  proverNodeMaxPendingJobs: number;
  proverNodePollingIntervalMs: number;
  proverNodeMaxParallelBlocksPerEpoch: number;
  proverNodeFailedEpochStore: string | undefined;
  txGatheringTimeoutMs: number;
  txGatheringIntervalMs: number;
  txGatheringBatchSize: number;
  txGatheringMaxParallelRequestsPerNode: number;
};

const specificProverNodeConfigMappings: ConfigMappingsType<SpecificProverNodeConfig> = {
  proverNodeMaxPendingJobs: {
    env: 'PROVER_NODE_MAX_PENDING_JOBS',
    description: 'The maximum number of pending jobs for the prover node',
    ...numberConfigHelper(10),
  },
  proverNodePollingIntervalMs: {
    env: 'PROVER_NODE_POLLING_INTERVAL_MS',
    description: 'The interval in milliseconds to poll for new jobs',
    ...numberConfigHelper(1000),
  },
  proverNodeMaxParallelBlocksPerEpoch: {
    env: 'PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH',
    description: 'The Maximum number of blocks to process in parallel while proving an epoch',
    ...numberConfigHelper(32),
  },
  proverNodeFailedEpochStore: {
    env: 'PROVER_NODE_FAILED_EPOCH_STORE',
    description: 'File store where to upload node state when an epoch fails to be proven',
    defaultValue: undefined,
  },
  txGatheringIntervalMs: {
    env: 'PROVER_NODE_TX_GATHERING_INTERVAL_MS',
    description: 'How often to check that tx data is available',
    ...numberConfigHelper(1_000),
  },
  txGatheringBatchSize: {
    env: 'PROVER_NODE_TX_GATHERING_BATCH_SIZE',
    description: 'How many transactions to gather from a node in a single request',
    ...numberConfigHelper(10),
  },
  txGatheringMaxParallelRequestsPerNode: {
    env: 'PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS_PER_NODE',
    description: 'How many tx requests to make in parallel to each node',
    ...numberConfigHelper(100),
  },
  txGatheringTimeoutMs: {
    env: 'PROVER_NODE_TX_GATHERING_TIMEOUT_MS',
    description: 'How long to wait for tx data to be available before giving up',
    ...numberConfigHelper(120_000),
  },
};

export const proverNodeConfigMappings: ConfigMappingsType<ProverNodeConfig> = {
  ...dataConfigMappings,
  ...archiverConfigMappings,
  ...proverClientConfigMappings,
  ...p2pConfigMappings,
  ...worldStateConfigMappings,
  ...getPublisherConfigMappings('PROVER'),
  ...getTxSenderConfigMappings('PROVER'),
  ...proverCoordinationConfigMappings,
  ...specificProverNodeConfigMappings,
  ...genesisStateConfigMappings,
  ...sharedNodeConfigMappings,
};

export function getProverNodeConfigFromEnv(): ProverNodeConfig {
  return getConfigFromMappings(proverNodeConfigMappings);
}

export function getProverNodeBrokerConfigFromEnv(): ProverBrokerConfig {
  return {
    ...getConfigFromMappings(proverBrokerConfigMappings),
  };
}

export function getProverNodeAgentConfigFromEnv(): ProverAgentConfig & BBConfig & ACVMConfig {
  return {
    ...getConfigFromMappings(proverAgentConfigMappings),
    ...getConfigFromMappings(bbConfigMappings),
  };
}

export function resolveConfig(userConfig: ProverNodeConfig): ProverNodeConfig & ProverClientConfig {
  const proverId =
    userConfig.proverId && !userConfig.proverId.isZero()
      ? userConfig.proverId
      : Fr.fromHexString(getAddressFromPrivateKey(userConfig.publisherPrivateKey.getValue()));
  return { ...userConfig, proverId };
}
