import { ProvingRequestType } from '@aztec/circuit-types';
import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

import { z } from 'zod';

export const ProverBrokerConfig = z.object({
  /** If starting a prover broker locally, the max number of retries per proving job */
  proverBrokerJobMaxRetries: z.number(),
  /** If starting a prover broker locally, the time after which a job times out and gets assigned to a different agent */
  proverBrokerJobTimeoutMs: z.number(),
  /** If starting a prover broker locally, the interval the broker checks for timed out jobs */
  proverBrokerPollIntervalMs: z.number(),
  /** If starting a prover broker locally, the directory to store broker data */
  dataDirectory: z.string().optional(),
  /** The size of the data store map */
  dataStoreMapSizeKB: z.number(),
});

export type ProverBrokerConfig = z.infer<typeof ProverBrokerConfig> &
  Pick<DataStoreConfig, 'dataStoreMapSizeKB' | 'dataDirectory'>;

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
  ...dataConfigMappings,
};

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
  /** Artificial delay to introduce to all operations to the test prover. */
  proverTestDelayMs: z.number(),
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
    ...booleanConfigHelper(false),
  },
  proverTestDelayMs: {
    env: 'PROVER_TEST_DELAY_MS',
    description: 'Artificial delay to introduce to all operations to the test prover.',
    ...numberConfigHelper(0),
  },
};
