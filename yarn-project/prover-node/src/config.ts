import { type ArchiverConfig, archiverConfigMappings, getArchiverConfigFromEnv } from '@aztec/archiver';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
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
  ProverCoordinationConfig & {
    proverNodeDisableAutomaticProving?: boolean;
    proverNodeMaxPendingJobs?: number;
    proverNodeEpochSize?: number;
  };

const specificProverNodeConfigMappings: ConfigMappingsType<
  Pick<ProverNodeConfig, 'proverNodeDisableAutomaticProving' | 'proverNodeMaxPendingJobs' | 'proverNodeEpochSize'>
> = {
  proverNodeDisableAutomaticProving: {
    env: 'PROVER_NODE_DISABLE_AUTOMATIC_PROVING',
    description: 'Whether to disable automatic proving of pending blocks seen on L1',
    ...booleanConfigHelper(false),
  },
  proverNodeMaxPendingJobs: {
    env: 'PROVER_NODE_MAX_PENDING_JOBS',
    description: 'The maximum number of pending jobs for the prover node',
    ...numberConfigHelper(100),
  },
  proverNodeEpochSize: {
    env: 'PROVER_NODE_EPOCH_SIZE',
    description: 'The number of blocks to prove in a single epoch',
    ...numberConfigHelper(2),
  },
};

export const proverNodeConfigMappings: ConfigMappingsType<ProverNodeConfig> = {
  ...archiverConfigMappings,
  ...proverClientConfigMappings,
  ...worldStateConfigMappings,
  ...getPublisherConfigMappings('PROVER'),
  ...getTxSenderConfigMappings('PROVER'),
  ...proverCoordinationConfigMappings,
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
    ...getConfigFromMappings(specificProverNodeConfigMappings),
  };
}
