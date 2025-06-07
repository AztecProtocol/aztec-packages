import type { ACVMConfig, BBConfig } from '@aztec/bb-prover';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type ProverConfig, proverConfigMappings } from '@aztec/stdlib/interfaces/server';

import {
  type ProverAgentConfig,
  type ProverBrokerConfig,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
} from './proving_broker/config.js';

/** The prover configuration as defined by the user. */
export type ProverClientUserConfig = ProverConfig & ProverAgentConfig & ProverBrokerConfig & BBConfig & ACVMConfig;

/** The prover configuration with all missing fields resolved. */
export type ProverClientConfig = ProverClientUserConfig & Required<Pick<ProverClientUserConfig, 'proverId'>>;

export const bbConfigMappings: ConfigMappingsType<BBConfig & ACVMConfig> = {
  acvmWorkingDirectory: {
    env: 'ACVM_WORKING_DIRECTORY',
    description: 'The working directory to use for simulation/proving',
  },
  acvmBinaryPath: {
    env: 'ACVM_BINARY_PATH',
    description: 'The path to the ACVM binary',
  },
  bbWorkingDirectory: {
    env: 'BB_WORKING_DIRECTORY',
    description: 'The working directory to use for proving',
  },
  bbBinaryPath: {
    env: 'BB_BINARY_PATH',
    description: 'The path to the bb binary',
  },
  bbSkipCleanup: {
    env: 'BB_SKIP_CLEANUP',
    description: 'Whether to skip cleanup of bb temporary files',
    ...booleanConfigHelper(false),
  },
  numConcurrentIVCVerifiers: {
    env: 'BB_NUM_IVC_VERIFIERS',
    description: 'Max number of client IVC verifiers to run concurrently',
    ...numberConfigHelper(8),
  },
};

export const proverClientConfigMappings: ConfigMappingsType<ProverClientUserConfig> = {
  ...bbConfigMappings,
  ...proverConfigMappings,
  ...proverAgentConfigMappings,
  ...proverBrokerConfigMappings,
};

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The prover configuration.
 */
export function getProverEnvVars(): ProverClientUserConfig {
  return getConfigFromMappings<ProverClientUserConfig>(proverClientConfigMappings);
}
