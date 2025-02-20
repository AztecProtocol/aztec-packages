import { getL1ContractsConfigEnvVars, getL1ReaderConfigFromEnv } from '@aztec/ethereum';
import type { L1ContractsConfig, L1ReaderConfig } from '@aztec/ethereum';

export type EpochCacheConfig = Pick<
  L1ReaderConfig & L1ContractsConfig,
  | 'l1RpcUrl'
  | 'l1ChainId'
  | 'viemPollingIntervalMS'
  | 'aztecSlotDuration'
  | 'ethereumSlotDuration'
  | 'aztecEpochDuration'
>;

export function getEpochCacheConfigEnvVars(): EpochCacheConfig {
  return { ...getL1ReaderConfigFromEnv(), ...getL1ContractsConfigEnvVars() };
}
