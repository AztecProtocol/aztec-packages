import {
  type ACVMConfig,
  type BBConfig,
  acvmConfigMappings,
  bbConfigMappings as bbProverConfigMappings,
} from '@aztec/bb-prover';
import { type ConfigMappingsType, buildConfigFromEnv, composeConfigMappings } from '@aztec/foundation/config';
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

export const bbConfigMappings: ConfigMappingsType<BBConfig & ACVMConfig> = composeConfigMappings(
  bbProverConfigMappings,
  acvmConfigMappings,
);

export const proverClientConfigMappings: ConfigMappingsType<ProverClientUserConfig> = composeConfigMappings(
  bbConfigMappings,
  proverConfigMappings,
  proverAgentConfigMappings,
  proverBrokerConfigMappings,
);

/**
 * Returns the prover configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The prover configuration.
 */
export function getProverEnvVars(): ProverClientUserConfig {
  return buildConfigFromEnv<ProverClientUserConfig>(proverClientConfigMappings);
}
