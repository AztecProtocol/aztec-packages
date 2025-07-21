import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  getL1ContractsConfigEnvVars,
  getL1ReaderConfigFromEnv,
} from '@aztec/ethereum';

export type EpochCacheConfig = Pick<
  L1ReaderConfig & L1ContractsConfig,
  | 'l1RpcUrls'
  | 'l1ChainId'
  | 'viemPollingIntervalMS'
  | 'aztecSlotDuration'
  | 'ethereumSlotDuration'
  | 'aztecEpochDuration'
>;

export function getEpochCacheConfigEnvVars(): EpochCacheConfig {
  return { ...getL1ReaderConfigFromEnv(), ...getL1ContractsConfigEnvVars() };
}
