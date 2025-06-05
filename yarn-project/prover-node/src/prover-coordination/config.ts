import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';

export type ProverCoordinationConfig = {
  proverCoordinationNodeUrls: string[];
};

export const proverCoordinationConfigMappings: ConfigMappingsType<ProverCoordinationConfig> = {
  proverCoordinationNodeUrls: {
    env: 'PROVER_COORDINATION_NODE_URLS',
    description: 'The URLs of the tx provider nodes',
    parseEnv: (val: string) => val.split(',').map(url => url.trim().replace(/\/$/, '')),
    defaultValue: [],
  },
};

export function getTxProviderConfigFromEnv(): ProverCoordinationConfig {
  return getConfigFromMappings<ProverCoordinationConfig>(proverCoordinationConfigMappings);
}
