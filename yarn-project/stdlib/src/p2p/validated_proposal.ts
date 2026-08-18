import type { Branded } from '@aztec/foundation/branded-types';

import type { BlockProposal } from './block_proposal.js';
import type { CheckpointProposalCore } from './checkpoint_proposal.js';

/**
 * A block proposal that has passed p2p ingress validation.
 *
 * Downstream consumers (the validator client's proposal handlers) rely on that validation having already
 * happened and do not repeat it, so this brand marks the proposals they are allowed to receive. It is a
 * compile-time marker only: at runtime a `ValidatedBlockProposal` is just a `BlockProposal`.
 */
export type ValidatedBlockProposal = Branded<BlockProposal, 'ValidatedBlockProposal'>;

/**
 * Marks a block proposal as having passed p2p ingress validation.
 *
 * May only be called at a point where the gossipsub topic validator has accepted the proposal, which covers
 * the signature context, the signature itself, the expected proposer for the slot, the index within the
 * checkpoint, the tx field checks, and the receive-window timeliness check.
 */
export function ValidatedBlockProposal(proposal: BlockProposal): ValidatedBlockProposal {
  return proposal as ValidatedBlockProposal;
}

/**
 * A checkpoint proposal (without its last block) that has passed p2p ingress validation.
 *
 * Downstream consumers (the validator client's proposal handlers) rely on that validation having already
 * happened and do not repeat it, so this brand marks the proposals they are allowed to receive. It is a
 * compile-time marker only: at runtime a `ValidatedCheckpointProposalCore` is just a `CheckpointProposalCore`.
 */
export type ValidatedCheckpointProposalCore = Branded<CheckpointProposalCore, 'ValidatedCheckpointProposalCore'>;

/**
 * Marks a checkpoint proposal as having passed p2p ingress validation.
 *
 * May only be called at a point where the gossipsub topic validator has accepted the proposal, which covers
 * the expected proposer for the slot and the receive-window timeliness check.
 */
export function ValidatedCheckpointProposalCore(proposal: CheckpointProposalCore): ValidatedCheckpointProposalCore {
  return proposal as ValidatedCheckpointProposalCore;
}
