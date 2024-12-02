import { type ArchiverConfig, archiverConfigMappings, getArchiverConfigFromEnv } from '@aztec/archiver';
import { type ACVMConfig, type BBConfig } from '@aztec/bb-prover';
import {
  type ProverAgentConfig,
  type ProverBrokerConfig,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
} from '@aztec/circuit-types';
import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings, getDataConfigFromEnv } from '@aztec/kv-store/config';
import { type P2PConfig, getP2PConfigFromEnv, p2pConfigMappings } from '@aztec/p2p';
import {
  type ProverClientConfig,
  bbConfigMappings,
  getProverEnvVars,
  proverClientConfigMappings,
} from '@aztec/prover-client';
import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigFromEnv,
  getPublisherConfigMappings,
  getTxSenderConfigFromEnv,
  getTxSenderConfigMappings,
} from '@aztec/sequencer-client';
import { type WorldStateConfig, getWorldStateConfigFromEnv, worldStateConfigMappings } from '@aztec/world-state';

import { type ProverBondManagerConfig, proverBondManagerConfigMappings } from './bond/config.js';
import {
  type ProverCoordinationConfig,
  getTxProviderConfigFromEnv,
  proverCoordinationConfigMappings,
} from './prover-coordination/config.js';

export type ProverNodeConfig = ArchiverConfig &
  ProverClientConfig &
  P2PConfig &
  WorldStateConfig &
  PublisherConfig &
  TxSenderConfig &
  DataStoreConfig &
  ProverCoordinationConfig &
  ProverBondManagerConfig &
  QuoteProviderConfig &
  SpecificProverNodeConfig;

type SpecificProverNodeConfig = {
  proverNodeMaxPendingJobs: number;
  proverNodePollingIntervalMs: number;
  proverNodeMaxParallelBlocksPerEpoch: number;
};

export type QuoteProviderConfig = {
  quoteProviderBasisPointFee: number;
  quoteProviderBondAmount: bigint;
  quoteProviderUrl?: string;
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
};

const quoteProviderConfigMappings: ConfigMappingsType<QuoteProviderConfig> = {
  quoteProviderBasisPointFee: {
    env: 'QUOTE_PROVIDER_BASIS_POINT_FEE',
    description: 'The basis point fee to charge for providing quotes',
    ...numberConfigHelper(100),
  },
  quoteProviderBondAmount: {
    env: 'QUOTE_PROVIDER_BOND_AMOUNT',
    description: 'The bond amount to charge for providing quotes',
    ...bigintConfigHelper(1000n),
  },
  quoteProviderUrl: {
    env: 'QUOTE_PROVIDER_URL',
    description:
      'The URL of the remote quote provider. Overrides QUOTE_PROVIDER_BASIS_POINT_FEE and QUOTE_PROVIDER_BOND_AMOUNT.',
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
  ...quoteProviderConfigMappings,
  ...proverBondManagerConfigMappings,
  ...specificProverNodeConfigMappings,
};

export function getProverNodeConfigFromEnv(): ProverNodeConfig {
  return {
    ...getDataConfigFromEnv(),
    ...getArchiverConfigFromEnv(),
    ...getProverEnvVars(),
    ...getP2PConfigFromEnv(),
    ...getWorldStateConfigFromEnv(),
    ...getPublisherConfigFromEnv('PROVER'),
    ...getTxSenderConfigFromEnv('PROVER'),
    ...getTxProviderConfigFromEnv(),
    ...getConfigFromMappings(quoteProviderConfigMappings),
    ...getConfigFromMappings(specificProverNodeConfigMappings),
    ...getConfigFromMappings(proverBondManagerConfigMappings),
  };
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
