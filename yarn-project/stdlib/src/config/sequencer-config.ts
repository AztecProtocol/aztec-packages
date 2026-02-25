import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

import type { SequencerConfig } from '../interfaces/configs.js';

/** Default maximum number of transactions per block. */
export const DEFAULT_MAX_TXS_PER_BLOCK = 32;

/**
 * Partial sequencer config mappings for fields that need to be shared across packages.
 * The full sequencer config mappings remain in sequencer-client, but shared fields
 * (like blockDurationMs needed by both p2p and sequencer-client) are defined here
 * to avoid duplication.
 */
export const sharedSequencerConfigMappings: ConfigMappingsType<
  Pick<SequencerConfig, 'blockDurationMs' | 'expectedBlockProposalsPerSlot' | 'maxTxsPerBlock'>
> = {
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description:
      'Duration per block in milliseconds when building multiple blocks per slot. ' +
      'If undefined (default), builds a single block per slot using the full slot duration.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : undefined),
  },
  expectedBlockProposalsPerSlot: {
    env: 'SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT',
    description:
      'Expected number of block proposals per slot for P2P peer scoring. ' +
      '0 (default) disables block proposal scoring. Set to a positive value to enable.',
    parseEnv: (val: string) => (val ? parseInt(val, 10) : 0),
    defaultValue: 0,
  },
  maxTxsPerBlock: {
    env: 'SEQ_MAX_TX_PER_BLOCK',
    description: 'The maximum number of txs to include in a block.',
    ...numberConfigHelper(DEFAULT_MAX_TXS_PER_BLOCK),
  },
};
