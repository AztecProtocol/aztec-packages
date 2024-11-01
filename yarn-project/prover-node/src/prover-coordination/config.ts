import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';

export type ProverCoordinationConfig = {
  proverCoordinationNodeUrl: string | undefined;
};

export const proverCoordinationConfigMappings: ConfigMappingsType<ProverCoordinationConfig> = {
  proverCoordinationNodeUrl: {
    env: 'PROVER_COORDINATION_NODE_URL',
    description: 'The URL of the tx provider node',
    parseEnv: (val: string) => val,
  },
};

export function getTxProviderConfigFromEnv(): ProverCoordinationConfig {
  return getConfigFromMappings<ProverCoordinationConfig>(proverCoordinationConfigMappings);
}
