import {
  type ConfigMappingsType,
  floatConfigHelper,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

import type { SequencerConfig } from '../interfaces/configs.js';

/** Default one-way P2P propagation time for proposals and attestations in seconds */
export const DEFAULT_P2P_PROPAGATION_TIME = 2;

/** Default maximum number of transactions per block. */
export const DEFAULT_MAX_TXS_PER_BLOCK = 32;

/** Default maximum number of blocks the sequencer packs into a single checkpoint. */
export const DEFAULT_MAX_BLOCKS_PER_CHECKPOINT = 24;

/**
 * Partial sequencer config mappings for fields that need to be shared across packages.
 * The full sequencer config mappings remain in sequencer-client, but shared fields
 * (like blockDurationMs needed by both p2p and sequencer-client) are defined here
 * to avoid duplication.
 */
export const sharedSequencerConfigMappings: ConfigMappingsType<
  Pick<
    SequencerConfig,
    | 'blockDurationMs'
    | 'expectedBlockProposalsPerSlot'
    | 'maxTxsPerBlock'
    | 'attestationPropagationTime'
    | 'maxBlocksPerCheckpoint'
  >
> = {
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description:
      'Duration per block in milliseconds when building multiple blocks per slot. ' +
      'If undefined (default), builds a single block per slot using the full slot duration.',
    ...optionalNumberConfigHelper(),
  },
  expectedBlockProposalsPerSlot: {
    env: 'SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT',
    description:
      'Expected number of block proposals per slot for P2P peer scoring. ' +
      '0 (default) disables block proposal scoring. Set to a positive value to enable.',
    ...numberConfigHelper(0),
  },
  maxTxsPerBlock: {
    env: 'SEQ_MAX_TX_PER_BLOCK',
    description: 'The maximum number of txs to include in a block.',
    ...optionalNumberConfigHelper(),
  },
  attestationPropagationTime: {
    env: 'SEQ_ATTESTATION_PROPAGATION_TIME',
    description: 'How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way).',
    defaultValue: DEFAULT_P2P_PROPAGATION_TIME,
    ...floatConfigHelper(DEFAULT_P2P_PROPAGATION_TIME),
  },
  maxBlocksPerCheckpoint: {
    env: 'MAX_BLOCKS_PER_CHECKPOINT',
    description:
      'Maximum number of blocks the sequencer packs into a single checkpoint, and the maximum indexWithinCheckpoint accepted on inbound block proposals.',
    parseEnv: (val: string) => parseInt(val, 10),
    defaultValue: DEFAULT_MAX_BLOCKS_PER_CHECKPOINT,
  },
};
