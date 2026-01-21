import type { SlotNumber } from '@aztec/foundation/branded-types';
import { type DateProvider, Deadline, type MonotonicTimestampMs } from '@aztec/foundation/timer';

/**
 * Encapsulates timing information for a specific slot using monotonic time.
 * Monotonic time is immune to NTP adjustments and wall-clock jumps.
 */
export class SlotTimingContext {
  public readonly slot: SlotNumber;
  public readonly slotStartBuildTimestamp: MonotonicTimestampMs;

  constructor(
    slot: SlotNumber,
    slotBuildStartTimestampSeconds: number, // Wall-clock timestamp (seconds) when slot building should start
    wallClockNowMs: number, // Current wall-clock time in milliseconds
    monotonicNow: MonotonicTimestampMs,
  ) {
    this.slot = slot;

    // Calculate the delta between wall-clock slot build start and current wall-clock time (in ms)
    const slotBuildStartTimestampMs = slotBuildStartTimestampSeconds * 1000;
    const wallClockDeltaMs = slotBuildStartTimestampMs - wallClockNowMs;

    // Apply the same delta to monotonic time to get the monotonic slot start timestamp
    this.slotStartBuildTimestamp = Math.floor(monotonicNow + wallClockDeltaMs) as MonotonicTimestampMs;
  }

  /**
   * Returns the number of seconds elapsed since the slot build start time.
   * Uses monotonic time, immune to wall-clock adjustments.
   */
  public getSecondsIntoSlot(dateProvider: DateProvider): number {
    const monotonicNow = dateProvider.monotonic();
    const elapsedMs = monotonicNow - this.slotStartBuildTimestamp;
    const elapsedSeconds = elapsedMs / 1000;
    return Number(elapsedSeconds.toFixed(3));
  }

  /**
   * Creates a deadline at a specified number of seconds into the slot.
   * The deadline is expressed as a monotonic timestamp.
   */
  public createDeadline(secondsIntoSlot: number): Deadline {
    const deadlineMs = Math.floor(this.slotStartBuildTimestamp + secondsIntoSlot * 1000);
    return Deadline.at(deadlineMs as MonotonicTimestampMs);
  }
}
