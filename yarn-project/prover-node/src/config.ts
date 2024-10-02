import { type ArchiverConfig, archiverConfigMappings, getArchiverConfigFromEnv } from '@aztec/archiver';
import {
  type ConfigMappingsType,
  bigintConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type ProverClientConfig, getProverEnvVars, proverClientConfigMappings } from '@aztec/prover-client';
import {
  type PublisherConfig,
  type TxSenderConfig,
  getPublisherConfigFromEnv,
  getPublisherConfigMappings,
  getTxSenderConfigFromEnv,
  getTxSenderConfigMappings,
} from '@aztec/sequencer-client';
import { type WorldStateConfig, getWorldStateConfigFromEnv, worldStateConfigMappings } from '@aztec/world-state';

import {
  type ProverCoordinationConfig,
  getTxProviderConfigFromEnv,
  proverCoordinationConfigMappings,
} from './prover-coordination/config.js';

export type ProverNodeConfig = ArchiverConfig &
  ProverClientConfig &
  WorldStateConfig &
  PublisherConfig &
  TxSenderConfig &
  ProverCoordinationConfig &
  QuoteProviderConfig & {
    proverNodeMaxPendingJobs: number;
    proverNodePollingIntervalMs: number;
  };

export type QuoteProviderConfig = {
  quoteProviderBasisPointFee: number;
  quoteProviderBondAmount: bigint;
};

const specificProverNodeConfigMappings: ConfigMappingsType<
  Pick<ProverNodeConfig, 'proverNodePollingIntervalMs' | 'proverNodeMaxPendingJobs'>
> = {
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
};

export const proverNodeConfigMappings: ConfigMappingsType<ProverNodeConfig> = {
  ...archiverConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...getPublisherConfigMappings('PROVER'),
  ...getTxSenderConfigMappings('PROVER'),
  ...proverCoordinationConfigMappings,
  ...quoteProviderConfigMappings,
  ...specificProverNodeConfigMappings,
};

export function getProverNodeConfigFromEnv(): ProverNodeConfig {
  return {
    ...getArchiverConfigFromEnv(),
    ...getProverEnvVars(),
    ...getWorldStateConfigFromEnv(),
    ...getPublisherConfigFromEnv('PROVER'),
    ...getTxSenderConfigFromEnv('PROVER'),
    ...getTxProviderConfigFromEnv(),
    ...getConfigFromMappings(quoteProviderConfigMappings),
    ...getConfigFromMappings(specificProverNodeConfigMappings),
  };
}
