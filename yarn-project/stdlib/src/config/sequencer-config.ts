import type { ConfigMappingsType } from '@aztec/foundation/config';

import type { SequencerConfig } from '../interfaces/configs.js';

/**
 * Partial sequencer config mappings for fields that need to be shared across packages.
 * The full sequencer config mappings remain in sequencer-client, but shared fields
 * (like blockDurationMs needed by both p2p and sequencer-client) are defined here
 * to avoid duplication.
 */
export const sharedSequencerConfigMappings: ConfigMappingsType<Pick<SequencerConfig, 'blockDurationMs'>> = {
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description:
      'Duration per block in milliseconds when building multiple blocks per slot. ' +
      'If undefined (default), builds a single block per slot using the full slot duration.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
};
