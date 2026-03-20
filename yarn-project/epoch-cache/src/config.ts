import { type L1ContractsConfig, getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { type L1ReaderConfig, getL1ReaderConfigFromEnv } from '@aztec/ethereum/l1-reader';
import { type PipelineConfig, getPipelineConfigEnvVars } from '@aztec/stdlib/config';

export type EpochCacheConfig = Pick<
  L1ReaderConfig & L1ContractsConfig & PipelineConfig,
  | 'l1RpcUrls'
  | 'l1ChainId'
  | 'viemPollingIntervalMS'
  | 'ethereumSlotDuration'
  | 'l1HttpTimeoutMS'
  | 'enableProposerPipelining'
>;

export function getEpochCacheConfigEnvVars(): EpochCacheConfig {
  return { ...getL1ReaderConfigFromEnv(), ...getL1ContractsConfigEnvVars(), ...getPipelineConfigEnvVars() };
}
