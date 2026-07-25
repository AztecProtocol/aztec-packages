import type { ACVMConfig, BBConfig } from '@aztec/bb-prover';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type ProverConfig, proverConfigMappings } from '@aztec/stdlib/interfaces/prover-config';

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
    description: 'Max concurrent verifications for the RPC verifier (QueuedIVCVerifier).',
    ...numberConfigHelper(8),
  },
  bbIVCConcurrency: {
    env: 'BB_IVC_CONCURRENCY',
    description: 'Thread count for the RPC IVC verifier.',
    ...numberConfigHelper(1),
  },
  bbChonkVerifyMaxBatch: {
    env: 'BB_CHONK_VERIFY_MAX_BATCH',
    description:
      'Upper bound on proofs per batch for the peer chonk batch verifier. Proofs are verified immediately as they arrive; this only caps how many can accumulate while a batch is already being processed.',
    ...numberConfigHelper(16),
  },
  bbChonkVerifyConcurrency: {
    env: 'BB_CHONK_VERIFY_BATCH_CONCURRENCY',
    description: 'Thread count for the peer batch verifier parallel reduce. 0 = auto.',
    ...numberConfigHelper(6),
  },
  bbDebugOutputDir: {
    env: 'BB_DEBUG_OUTPUT_DIR',
    description:
      'When set, bb.js operations write input/output files and log equivalent CLI commands to this directory',
  },
  bbLegacyMsm: {
    env: 'BB_LEGACY_MSM',
    description:
      'Whether prover agents use the legacy Pippenger/MSM implementation. Defaults to false, so agents use the round-parallel MSM.',
    ...booleanConfigHelper(false),
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
