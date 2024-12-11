import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { ProvingRequestType } from './proving-job.js';

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

export interface ProverAgentApi {
  setMaxConcurrency(maxConcurrency: number): Promise<void>;

  isRunning(): Promise<boolean>;

  getCurrentJobs(): Promise<{ id: string; type: string }[]>;
}

export const ProverAgentApiSchema: ApiSchemaFor<ProverAgentApi> = {
  setMaxConcurrency: z.function().args(z.number().min(1).int()).returns(z.void()),
  isRunning: z.function().args().returns(z.boolean()),
  getCurrentJobs: z
    .function()
    .args()
    .returns(z.array(z.object({ id: z.string(), type: z.string() }))),
};
