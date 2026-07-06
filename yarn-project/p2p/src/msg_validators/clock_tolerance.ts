import {
  DEFAULT_P2P_PROPAGATION_TIME,
  type EpochCacheInterface,
  createPipelinedCheckpointTimingModel,
} from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';

/**
 * Maximum clock disparity tolerance for P2P message validation (in milliseconds).
 * Messages for the previous slot are accepted if we're within this many milliseconds
 * of the current slot start. This prevents penalizing peers for messages that
 * were valid when sent but arrived slightly late due to network latency.
 *
 * This follows Ethereum's MAXIMUM_GOSSIP_CLOCK_DISPARITY approach.
 */
export const MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS = 500;

/**
 * Checks if a message for the previous slot should be accepted due to clock tolerance.
 *
 * @param messageSlot - The slot number from the received message
 * @param currentSlot - The current slot number
 * @param epochCache - EpochCache to get timing information
 * @returns true if the message is for the previous slot AND we're within the clock tolerance window
 */
export function isWithinClockTolerance(
  messageSlot: SlotNumber,
  currentSlot: SlotNumber,
  epochCache: EpochCacheInterface,
): boolean {
  // Guard against slot 0 edge case (genesis)
  if (currentSlot === SlotNumber.ZERO) {
    return false;
  }

  // Only apply tolerance to messages for the previous slot
  const previousSlot = SlotNumber(currentSlot - 1);
  if (messageSlot !== previousSlot) {
    return false;
  }

  // Check how far we are into the current slot (in milliseconds)
  const { ts: slotStartTs, nowMs } = epochCache.getEpochAndSlotNow();
  const targetSlot = epochCache.getTargetSlot();

  // Sanity check: ensure the epoch cache's target slot matches the expected current slot
  if (targetSlot !== currentSlot) {
    return false;
  }

  // ts is in seconds, convert to ms; nowMs is already in milliseconds
  const slotStartMs = slotStartTs * 1000n;
  const elapsedMs = Number(nowMs - slotStartMs);

  return elapsedMs < MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
}

/**
 * Checks if a straggler message for the previous target slot should be accepted.
 *
 * Proposals and attestations carry the target slot N. Most of the time the receiver is either
 * still in the build slot N-1 (accepted via the main `slotNumber === targetSlot` match) or in the
 * target slot N (accepted again via `targetSlot`). Stragglers that arrive after the receiver has
 * rolled past the target slot fall to this check: accept `messageSlot === slotNow` while we're
 * still within the first `windowSeconds + clock-disparity` of the slot.
 *
 * Under the early-pipelining schedule `windowSeconds` is small (0 for proposals,
 * `2*p2pPropagationTime` for attestations) since the proposer collects everything
 * before the slot boundary.
 *
 * @param messageSlot - The slot number from the received message
 * @param epochCache - EpochCache to get timing state
 * @param windowSeconds - How far into the current slot we still accept previous-target messages
 * @returns true if the message is for the current wallclock slot and we're within the grace period
 */
function isWithinPipeliningWindow(
  messageSlot: SlotNumber,
  epochCache: EpochCacheInterface,
  windowSeconds: number,
): boolean {
  const currentSlot = epochCache.getSlotNow();
  if (messageSlot !== currentSlot) {
    return false;
  }

  const { ts: slotStartTs, nowMs } = epochCache.getEpochAndSlotNow();
  const slotStartMs = slotStartTs * 1000n;
  const elapsedMs = Number(nowMs - slotStartMs);
  const windowMs = windowSeconds * 1000 + MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;

  return elapsedMs < windowMs;
}

export class PipeliningWindow {
  private readonly proposalWindowIntoTargetSlot: number;
  private readonly attestationWindowIntoTargetSlot: number;

  constructor(
    private readonly epochCache: EpochCacheInterface,
    opts: {
      p2pPropagationTime?: number;
      l1PublishingTime?: number;
    } = {},
  ) {
    const l1Constants = epochCache.getL1Constants();
    const checkpointTiming = createPipelinedCheckpointTimingModel({
      aztecSlotDuration: l1Constants.slotDuration,
      ethereumSlotDuration: l1Constants.ethereumSlotDuration,
      l1PublishingTime: opts.l1PublishingTime ?? l1Constants.ethereumSlotDuration,
      p2pPropagationTime: opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME,
    });

    this.proposalWindowIntoTargetSlot = checkpointTiming.proposalWindowIntoTargetSlot;
    this.attestationWindowIntoTargetSlot = checkpointTiming.attestationWindowIntoTargetSlot;
  }

  public acceptsProposal(messageSlot: SlotNumber): boolean {
    return isWithinPipeliningWindow(messageSlot, this.epochCache, this.proposalWindowIntoTargetSlot);
  }

  public acceptsAttestation(messageSlot: SlotNumber): boolean {
    return isWithinPipeliningWindow(messageSlot, this.epochCache, this.attestationWindowIntoTargetSlot);
  }
}
