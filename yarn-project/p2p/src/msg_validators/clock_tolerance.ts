import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';

/**
 * Maximum clock disparity tolerance for P2P message validation (in milliseconds).
 *
 * Acceptance windows are widened by this much on both ends so peers are not penalized for messages
 * that were valid when sent but arrived slightly early or late due to clock skew. This follows
 * Ethereum's MAXIMUM_GOSSIP_CLOCK_DISPARITY approach.
 */
export const MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS = 500;

/**
 * Computes explicit absolute acceptance windows for pipelined proposals and attestations.
 *
 * A message for target slot `N` is accepted iff `now ∈ [receiveStart(N) − δ, deadline(N) + δ]`, where
 * `δ = MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS`. Both lower bounds are the build-frame start (nothing
 * legitimate for slot `N` exists before its build frame opens). The two cases differ in the upper bound:
 * - Checkpoint proposals use `getCheckpointProposalReceiveDeadline` (`target_slot_start − E − D`), a tight
 *   non-overlapping window so a received proposal maps unambiguously to one target slot.
 * - Attestations use `getAttestationDeadline` (`target_slot_start + S − 2E`), a deliberately liberal
 *   window; attestations are attributed by content (`(slot, checkpoint)` in the signature), not timing.
 */
export class PipeliningWindow {
  private readonly timetable: ConsensusTimetable;

  constructor(
    private readonly epochCache: EpochCacheInterface,
    opts: { blockDurationMs?: number } = {},
  ) {
    const l1Constants = epochCache.getL1Constants();
    this.timetable = new ConsensusTimetable({
      l1Constants,
      blockDuration: opts.blockDurationMs !== undefined ? opts.blockDurationMs / 1000 : undefined,
    });
  }

  /** Accepts a checkpoint or block proposal for `messageSlot` iff within its proposal receive window. */
  public acceptsProposal(messageSlot: SlotNumber): boolean {
    const start = this.timetable.getCheckpointProposalReceiveStart(messageSlot);
    const deadline = this.timetable.getCheckpointProposalReceiveDeadline(messageSlot);
    return this.isWithinWindow(start, deadline);
  }

  /** Accepts an attestation for `messageSlot` iff within its (liberal) attestation receive window. */
  public acceptsAttestation(messageSlot: SlotNumber): boolean {
    const start = this.timetable.getAttestationReceiveStart(messageSlot);
    const deadline = this.timetable.getAttestationDeadline(messageSlot);
    return this.isWithinWindow(start, deadline);
  }

  private isWithinWindow(startSeconds: number, deadlineSeconds: number): boolean {
    const nowMs = Number(this.epochCache.getEpochAndSlotNow().nowMs);
    const lowerMs = startSeconds * 1000 - MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
    const upperMs = deadlineSeconds * 1000 + MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
    return nowMs >= lowerMs && nowMs <= upperMs;
  }
}
