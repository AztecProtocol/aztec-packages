import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  getL1ContractsConfigEnvVars,
  getL1ReaderConfigFromEnv,
} from '@aztec/ethereum';

export type EpochCacheConfig = L1ReaderConfig & L1ContractsConfig;

export function getEpochCacheConfigEnvVars(): EpochCacheConfig {
  return { ...getL1ReaderConfigFromEnv(), ...getL1ContractsConfigEnvVars() };
}
