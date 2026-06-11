import { type L1ContractsConfig, getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { type L1ReaderConfig, getL1ReaderConfigFromEnv } from '@aztec/ethereum/l1-reader';

export type EpochCacheConfig = Pick<
  L1ReaderConfig & L1ContractsConfig,
  'l1RpcUrls' | 'l1ChainId' | 'viemPollingIntervalMS' | 'ethereumSlotDuration' | 'l1PublishLeadTime' | 'l1HttpTimeoutMS'
>;

export function getEpochCacheConfigEnvVars(): EpochCacheConfig {
  return { ...getL1ReaderConfigFromEnv(), ...getL1ContractsConfigEnvVars() };
}
