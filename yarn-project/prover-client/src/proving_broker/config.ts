import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { pickConfigMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { z } from 'zod';

export const ProverBrokerConfig = z.object({
  /** If starting a prover broker locally, the max number of retries per proving job */
  proverBrokerJobMaxRetries: z.number().int().nonnegative(),
  /** If starting a prover broker locally, the time after which a job times out and gets assigned to a different agent */
  proverBrokerJobTimeoutMs: z.number().int().nonnegative(),
  /** If starting a prover broker locally, the interval the broker checks for timed out jobs */
  proverBrokerPollIntervalMs: z.number().int().nonnegative(),
  /** If starting a prover broker locally, the directory to store broker data */
  dataDirectory: z.string().optional(),
  /** The size of the data store map */
  dataStoreMapSizeKB: z.number().int().nonnegative(),
  /** The size of the prover broker's database. Will override the dataStoreMapSizeKB if set. */
  proverBrokerStoreMapSizeKB: z.number().int().nonnegative().optional(),
  /** The prover broker may batch jobs together before writing to the database */
  proverBrokerBatchSize: z.number().int().nonnegative(),
  /** How often the job batches get flushed */
  proverBrokerBatchIntervalMs: z.number().int().nonnegative(),
  /** The maximum number of epochs to keep results for */
  proverBrokerMaxEpochsToKeepResultsFor: z.number().int().nonnegative(),
});

export type ProverBrokerConfig = z.infer<typeof ProverBrokerConfig> &
  Pick<DataStoreConfig, 'dataStoreMapSizeKB' | 'dataDirectory'> &
  L1ReaderConfig &
  Pick<ChainConfig, 'rollupVersion'>;

export const proverBrokerConfigMappings: ConfigMappingsType<ProverBrokerConfig> = {
  proverBrokerJobTimeoutMs: {
    env: 'PROVER_BROKER_JOB_TIMEOUT_MS',
    description: 'Jobs are retried if not kept alive for this long',
    ...numberConfigHelper(30_000),
  },
  proverBrokerPollIntervalMs: {
    env: 'PROVER_BROKER_POLL_INTERVAL_MS',
    description: 'The interval to check job health status',
    ...numberConfigHelper(1_000),
  },
  proverBrokerJobMaxRetries: {
    env: 'PROVER_BROKER_JOB_MAX_RETRIES',
    description: 'If starting a prover broker locally, the max number of retries per proving job',
    ...numberConfigHelper(3),
  },
  proverBrokerBatchSize: {
    env: 'PROVER_BROKER_BATCH_SIZE',
    description: 'The prover broker writes jobs to disk in batches',
    ...numberConfigHelper(100),
  },
  proverBrokerBatchIntervalMs: {
    env: 'PROVER_BROKER_BATCH_INTERVAL_MS',
    description: 'How often to flush batches to disk',
    ...numberConfigHelper(50),
  },
  proverBrokerMaxEpochsToKeepResultsFor: {
    env: 'PROVER_BROKER_MAX_EPOCHS_TO_KEEP_RESULTS_FOR',
    description: 'The maximum number of epochs to keep results for',
    ...numberConfigHelper(1),
  },
  proverBrokerStoreMapSizeKB: {
    env: 'PROVER_BROKER_STORE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: "The size of the prover broker's database. Will override the dataStoreMapSizeKB if set.",
  },
  ...dataConfigMappings,
  ...l1ReaderConfigMappings,
  ...pickConfigMappings(chainConfigMappings, ['rollupVersion']),
};

export const defaultProverBrokerConfig: ProverBrokerConfig = getDefaultConfig(proverBrokerConfigMappings);

export const ProverAgentConfig = z.object({
  /** The number of prover agents to start */
  proverAgentCount: z.number(),
  /** The types of proofs the prover agent can generate */
  proverAgentProofTypes: z.array(z.nativeEnum(ProvingRequestType)),
  /** How often the prover agents poll for jobs */
  proverAgentPollIntervalMs: z.number(),
  /** The URL where this agent takes jobs from */
  proverBrokerUrl: z.string().optional(),
  /** Whether to construct real proofs */
  realProofs: z.boolean(),
  /** The type of artificial delay to introduce */
  proverTestDelayType: z.enum(['fixed', 'realistic']),
  /** If using fixed delay, the time each operation takes. */
  proverTestDelayMs: z.number(),
  /** If using realistic delays, what percentage of realistic times to apply. */
  proverTestDelayFactor: z.number(),
});

export type ProverAgentConfig = z.infer<typeof ProverAgentConfig>;

export const proverAgentConfigMappings: ConfigMappingsType<ProverAgentConfig> = {
  proverAgentCount: {
    env: 'PROVER_AGENT_COUNT',
    description: 'Whether this prover has a local prover agent',
    ...numberConfigHelper(1),
  },
  proverAgentPollIntervalMs: {
    env: 'PROVER_AGENT_POLL_INTERVAL_MS',
    description: 'The interval agents poll for jobs at',
    ...numberConfigHelper(100),
  },
  proverAgentProofTypes: {
    env: 'PROVER_AGENT_PROOF_TYPES',
    description: 'The types of proofs the prover agent can generate',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(v => ProvingRequestType[v as any])
        .filter(v => typeof v === 'number'),
  },
  proverBrokerUrl: {
    env: 'PROVER_BROKER_HOST',
    description: 'The URL where this agent takes jobs from',
  },
  realProofs: {
    env: 'PROVER_REAL_PROOFS',
    description: 'Whether to construct real proofs',
    ...booleanConfigHelper(true),
  },
  proverTestDelayType: {
    env: 'PROVER_TEST_DELAY_TYPE',
    description: 'The type of artificial delay to introduce',
    defaultValue: 'fixed',
  },
  proverTestDelayMs: {
    env: 'PROVER_TEST_DELAY_MS',
    description: 'Artificial delay to introduce to all operations to the test prover.',
    ...numberConfigHelper(0),
  },
  proverTestDelayFactor: {
    env: 'PROVER_TEST_DELAY_FACTOR',
    description: 'If using realistic delays, what percentage of realistic times to apply.',
    ...numberConfigHelper(1),
  },
};
