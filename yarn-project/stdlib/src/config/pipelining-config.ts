import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

import { z } from 'zod';

import { zodFor } from '../schemas/index.js';

export interface PipelineConfig {
  /** Whether to enable build-ahead proposer pipelining. */
  enableProposerPipelining: boolean;
}

/**
 * Pipelining config mappings for fields that need to be shared across packages.
 */
export const pipelineConfigMappings: ConfigMappingsType<PipelineConfig> = {
  enableProposerPipelining: {
    env: 'SEQ_ENABLE_PROPOSER_PIPELINING',
    description: 'Whether to enable build-ahead proposer pipelining.',
    ...booleanConfigHelper(false),
  },
};

export const PipelineConfigSchema = zodFor<PipelineConfig>()(
  z.object({
    enableProposerPipelining: z.boolean(),
  }),
);

export function getPipelineConfigEnvVars(): PipelineConfig {
  return getConfigFromMappings(pipelineConfigMappings);
}
