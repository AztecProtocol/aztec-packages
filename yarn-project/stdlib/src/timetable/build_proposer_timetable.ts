import {
  DEFAULT_BLOCK_DURATION,
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
} from './budgets.js';
import type { SlotTimingConstants } from './consensus_timetable.js';
import { ProposerTimetable } from './proposer_timetable.js';

/**
 * Subset of the sequencer/p2p config the proposer timetable derives its operational budgets from. Both
 * {@link SequencerConfig} and {@link P2PConfig} structurally satisfy this, so the same builder is used by
 * the sequencer, the p2p layer, and the node's `getNodeInfo`.
 */
export type ProposerTimetableConfig = {
  blockDurationMs?: number;
  minBlockDuration?: number;
  attestationPropagationTime?: number;
  checkpointProposalPrepareTime?: number;
  checkpointProposalSyncGraceSeconds?: number;
};

/**
 * Builds the proposer timetable from a sequencer/p2p config and the slot-timing protocol constants,
 * applying the shared stdlib budget defaults. Single source of truth shared by the sequencer, the p2p
 * layer, and the node's `getNodeInfo` so they all derive the same `maxBlocksPerCheckpoint`.
 */
export function buildProposerTimetable(
  config: ProposerTimetableConfig,
  l1Constants: SlotTimingConstants,
): ProposerTimetable {
  return new ProposerTimetable({
    l1Constants,
    blockDuration: config.blockDurationMs !== undefined ? config.blockDurationMs / 1000 : DEFAULT_BLOCK_DURATION,
    minBlockDuration: config.minBlockDuration ?? DEFAULT_MIN_BLOCK_DURATION,
    p2pPropagationTime: config.attestationPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME,
    checkpointProposalPrepareTime: config.checkpointProposalPrepareTime ?? DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
    checkpointProposalInitTime: DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
    checkpointProposalSyncGrace: config.checkpointProposalSyncGraceSeconds,
  });
}
