import { type BBConfig } from '@aztec/bb-prover';
import { type ProverConfig, proverConfigMappings } from '@aztec/circuit-types';
import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

/**
 * The prover configuration.
 */
export type ProverClientConfig = ProverConfig &
  BBConfig & {
    /** The URL to the Aztec prover node to take proving jobs from */
    proverJobSourceUrl?: string;
    /** The working directory to use for simulation/proving */
    acvmWorkingDirectory: string;
    /** The path to the ACVM binary */
    acvmBinaryPath: string;
  };

export const proverClientConfigMappings: ConfigMappingsType<ProverClientConfig> = {
  proverJobSourceUrl: {
    env: 'PROVER_JOB_SOURCE_URL',
    description: 'The URL to the Aztec prover node to take proving jobs from',
  },
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
    description: 'The working directory to for proving',
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
  ...proverConfigMappings,
};

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The prover configuration.
 */
export function getProverEnvVars(): ProverClientConfig {
  return getConfigFromMappings<ProverClientConfig>(proverClientConfigMappings);
}
