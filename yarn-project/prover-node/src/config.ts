import { type ArchiverConfig, archiverConfigMappings } from '@aztec/archiver/config';
import { type ACVMConfig, type BBConfig } from '@aztec/bb-prover/config';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type P2PConfig, p2pConfigMappings } from '@aztec/p2p/config';
import {
  type ProverAgentConfig,
  type ProverBrokerConfig,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
} from '@aztec/prover-client/broker';
import { type ProverClientConfig, bbConfigMappings, proverClientConfigMappings } from '@aztec/prover-client/config';
import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigMappings,
  getTxSenderConfigMappings,
} from '@aztec/sequencer-client/config';
import { type WorldStateConfig, worldStateConfigMappings } from '@aztec/world-state/config';

import { type ProverCoordinationConfig, proverCoordinationConfigMappings } from './prover-coordination/config.js';

export type ProverNodeConfig = ArchiverConfig &
  ProverClientConfig &
  P2PConfig &
  WorldStateConfig &
  PublisherConfig &
  TxSenderConfig &
  DataStoreConfig &
  ProverCoordinationConfig &
  SpecificProverNodeConfig & {
    /** Whether to populate the genesis state with initial fee juice for the test accounts */
    testAccounts: boolean;
  };

type SpecificProverNodeConfig = {
  proverNodeMaxPendingJobs: number;
  proverNodePollingIntervalMs: number;
  proverNodeMaxParallelBlocksPerEpoch: number;
  txGatheringTimeoutMs: number;
  txGatheringIntervalMs: number;
  txGatheringMaxParallelRequests: number;
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
  txGatheringTimeoutMs: {
    env: 'PROVER_NODE_TX_GATHERING_TIMEOUT_MS',
    description: 'The maximum amount of time to wait for tx data to be available',
    ...numberConfigHelper(60_000),
  },
  txGatheringIntervalMs: {
    env: 'PROVER_NODE_TX_GATHERING_INTERVAL_MS',
    description: 'How often to check that tx data is available',
    ...numberConfigHelper(1_000),
  },
  txGatheringMaxParallelRequests: {
    env: 'PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS',
    description: 'How many txs to load up a time',
    ...numberConfigHelper(100),
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
  testAccounts: {
    env: 'TEST_ACCOUNTS',
    description: 'Whether to populate the genesis state with initial fee juice for the test accounts.',
    ...booleanConfigHelper(false),
  },
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
