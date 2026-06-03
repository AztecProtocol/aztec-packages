import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { ConsensusTimetable } from '@aztec/stdlib/timetable';

/**
 * Maximum clock disparity tolerance for P2P message validation (in milliseconds).
 *
 * Acceptance windows are widened by this much on both ends so peers are not penalized for messages
 * that were valid when sent but arrived slightly early or late due to clock skew. This follows
 * Ethereum's MAXIMUM_GOSSIP_CLOCK_DISPARITY approach. This is a gossip concern, not a consensus one,
 * so it lives in p2p rather than in the stdlib timetable.
 */
export const MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS = 500;

/**
 * Tests whether `nowMs` falls within `[startSeconds·1000 − δ, deadlineSeconds·1000 + δ]`, where
 * `δ = MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS`. The seconds bounds come from a {@link ConsensusTimetable}
 * getter; this is the single acceptance gate validators apply to proposals and attestations.
 */
export function isWithinClockWindow(nowMs: number, startSeconds: number, deadlineSeconds: number): boolean {
  const lowerMs = startSeconds * 1000 - MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
  const upperMs = deadlineSeconds * 1000 + MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
  return nowMs >= lowerMs && nowMs <= upperMs;
}

/** Bounds of a per-slot acceptance window in seconds, plus the disparity-widened millisecond gate. */
export type ClockWindowBounds = {
  /** Lower bound of the receive window in seconds (before clock-disparity widening). */
  startSeconds: number;
  /** Upper bound of the receive window in seconds (before clock-disparity widening). */
  deadlineSeconds: number;
};

/** Proposal receive window for `slot`: `[checkpoint_proposal_receive_start, checkpoint_proposal_receive_deadline]`. */
export function getProposalReceiveWindow(timetable: ConsensusTimetable, slot: SlotNumber): ClockWindowBounds {
  return {
    startSeconds: timetable.getCheckpointProposalReceiveStart(slot),
    deadlineSeconds: timetable.getCheckpointProposalReceiveDeadline(slot),
  };
}

/** Attestation receive window for `slot`: `[attestation_receive_start, attestation_deadline]` (deliberately liberal). */
export function getAttestationReceiveWindow(timetable: ConsensusTimetable, slot: SlotNumber): ClockWindowBounds {
  return {
    startSeconds: timetable.getAttestationReceiveStart(slot),
    deadlineSeconds: timetable.getAttestationDeadline(slot),
  };
}
