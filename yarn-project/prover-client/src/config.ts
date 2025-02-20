import type { ACVMConfig, BBConfig } from '@aztec/bb-prover';
import { proverConfigMappings } from '@aztec/circuit-types/interfaces/server';
import type { ProverConfig } from '@aztec/circuit-types/interfaces/server';
import { booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';
import type { ConfigMappingsType } from '@aztec/foundation/config';

import { proverAgentConfigMappings, proverBrokerConfigMappings } from './proving_broker/config.js';
import type { ProverAgentConfig, ProverBrokerConfig } from './proving_broker/config.js';

/**
 * The prover configuration.
 */
export type ProverClientConfig = ProverConfig & ProverAgentConfig & ProverBrokerConfig & BBConfig & ACVMConfig;

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
};

export const proverClientConfigMappings: ConfigMappingsType<ProverClientConfig> = {
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
export function getProverEnvVars(): ProverClientConfig {
  return getConfigFromMappings<ProverClientConfig>(proverClientConfigMappings);
}
