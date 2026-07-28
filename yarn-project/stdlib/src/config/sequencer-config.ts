import {
  type ConfigMappingsType,
  booleanConfigHelper,
  floatConfigHelper,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

import type { SequencerConfig } from '../interfaces/configs.js';
import {
  DEFAULT_BLOCK_DURATION,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
  getDefaultCheckpointProposalSyncGrace,
} from '../timetable/index.js';

/** Default duration per block in milliseconds, used to derive how many blocks fit in a slot. */
export const DEFAULT_BLOCK_DURATION_MS = DEFAULT_BLOCK_DURATION * 1000;

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
    | 'checkpointProposalSyncGraceSeconds'
    | 'expectedBlockProposalsPerSlot'
    | 'maxTxsPerBlock'
    | 'attestationPropagationTime'
    | 'checkpointProposalPrepareTime'
    | 'minBlockDuration'
    | 'maxBlocksPerCheckpoint'
    | 'streamingInbox'
  >
> = {
  blockDurationMs: {
    env: 'SEQ_BLOCK_DURATION_MS',
    description: 'Duration per block in milliseconds, used to derive how many blocks fit in a slot.',
    ...numberConfigHelper(DEFAULT_BLOCK_DURATION_MS),
  },
  expectedBlockProposalsPerSlot: {
    env: 'SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT',
    description:
      'Expected number of block proposals per slot for P2P peer scoring. ' +
      '0 (default) disables block proposal scoring. Set to a positive value to enable.',
    ...numberConfigHelper(0),
  },
  checkpointProposalSyncGraceSeconds: {
    env: 'CHECKPOINT_PROPOSAL_SYNC_GRACE_SECONDS',
    description:
      'Consensus grace in seconds for a received checkpoint proposal to materialize into local proposed state. ' +
      'Defaults to twice the block duration.',
    defaultValue: getDefaultCheckpointProposalSyncGrace(DEFAULT_BLOCK_DURATION_MS / 1000),
    ...optionalNumberConfigHelper(),
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
  checkpointProposalPrepareTime: {
    env: 'SEQ_CHECKPOINT_PROPOSAL_PREPARE_TIME',
    description:
      'Local time in seconds between the last block build finishing and the checkpoint proposal being ready for p2p send.',
    defaultValue: DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
    ...floatConfigHelper(DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME),
  },
  minBlockDuration: {
    env: 'SEQ_MIN_BLOCK_DURATION',
    description: 'Minimum block-building time in seconds still worth allocating if the proposer starts late.',
    defaultValue: DEFAULT_MIN_BLOCK_DURATION,
    ...floatConfigHelper(DEFAULT_MIN_BLOCK_DURATION),
  },
  maxBlocksPerCheckpoint: {
    env: 'MAX_BLOCKS_PER_CHECKPOINT',
    description:
      'Maximum number of blocks the sequencer packs into a single checkpoint, and the maximum indexWithinCheckpoint accepted on inbound block proposals.',
    parseEnv: (val: string) => parseInt(val, 10),
    defaultValue: DEFAULT_MAX_BLOCKS_PER_CHECKPOINT,
  },
  streamingInbox: {
    env: 'STREAMING_INBOX',
    description:
      'Select L1-to-L2 messages per block from the streaming Inbox buckets (AZIP-22 Fast Inbox) instead of the whole ' +
      "checkpoint's messages up front. Shared by the sequencer and validator, which must flip together. Default off: " +
      'pre-flip a checkpoint built with this on is expected to fail L1 submission.',
    ...booleanConfigHelper(false),
  },
};
