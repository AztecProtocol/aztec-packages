import type { EpochCacheInterface } from '@aztec/epoch-cache';
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
  const { ts: slotStartTs, nowMs, slot } = epochCache.getEpochAndSlotNow();

  // Sanity check: ensure the epoch cache's current slot matches the expected current slot
  if (slot !== currentSlot) {
    return false;
  }

  // ts is in seconds, convert to ms; nowMs is already in milliseconds
  const slotStartMs = slotStartTs * 1000n;
  const elapsedMs = Number(nowMs - slotStartMs);

  return elapsedMs < MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS;
}
