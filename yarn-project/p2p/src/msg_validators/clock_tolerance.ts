import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { DEFAULT_P2P_PROPAGATION_TIME } from '@aztec/stdlib/timetable';

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
 * Checks if a message should be accepted under the pipelining grace period.
 *
 * When pipelining is enabled, `targetSlot = slotNow + 1`. A proposal built in slot N-1
 * for slot N arrives when validators are in slot N, so their `targetSlot = N+1`.
 * This function accepts proposals for the current wallclock slot if we're within the
 * first `DEFAULT_P2P_PROPAGATION_TIME` seconds of the slot (the pipelining grace period).
 *
 * @param messageSlot - The slot number from the received message
 * @param epochCache - EpochCache to get timing and pipelining state
 * @returns true if pipelining is enabled, the message is for the current slot, and we're within the grace period
 */
export function isWithinPipeliningGracePeriod(messageSlot: SlotNumber, epochCache: EpochCacheInterface): boolean {
  if (!epochCache.isProposerPipeliningEnabled()) {
    return false;
  }

  const currentSlot = epochCache.getSlotNow();
  if (messageSlot !== currentSlot) {
    return false;
  }

  const { ts: slotStartTs, nowMs } = epochCache.getEpochAndSlotNow();
  const slotStartMs = slotStartTs * 1000n;
  const elapsedMs = Number(nowMs - slotStartMs);
  const gracePeriodMs = DEFAULT_P2P_PROPAGATION_TIME * 1000;

  return elapsedMs < gracePeriodMs;
}
