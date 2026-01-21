import { sleep } from '../sleep/index.js';
import { DateProvider } from './date.js';
import type { MonotonicTimestampMs } from './monotonic_timestamp.js';

declare const DeadlineBrand: unique symbol;
/**
 * A deadline expressed as a monotonic timestamp.
 * Immune to wall-clock jumps.
 */
export type Deadline = number & { [DeadlineBrand]: never };

export const Deadline = {
  /** Create a deadline at a specific monotonic timestamp */
  at(timestamp: MonotonicTimestampMs): Deadline {
    return timestamp as unknown as Deadline;
  },

  /** Convert a wall-clock Date to a monotonic Deadline */
  fromDate(date: Date, dateProvider: DateProvider): Deadline {
    const remainingMs = Math.max(0, date.getTime() - dateProvider.now());
    return Math.floor(dateProvider.monotonic() + remainingMs) as unknown as Deadline;
  },

  /** Convert a monotonic Deadline back to a wall-clock Date */
  toDate(deadline: Deadline, dateProvider: DateProvider): Date {
    return new Date(dateProvider.now() + Deadline.remainingMs(deadline, dateProvider));
  },

  /** Check if a deadline has expired (strictly past the deadline) */
  hasExpired(deadline: Deadline, dateProvider: DateProvider): boolean {
    return dateProvider.monotonic() > Deadline.toMs(deadline);
  },

  /** Convert a Deadline to its underlying millisecond value */
  toMs(deadline: Deadline): number {
    return deadline as unknown as number;
  },

  /** Create a new deadline that is `ms` before the given deadline */
  subtract(deadline: Deadline, ms: number): Deadline {
    return (Deadline.toMs(deadline) - ms) as unknown as Deadline;
  },

  /** Get remaining time until deadline in milliseconds (0 if already expired) */
  remainingMs(deadline: Deadline, dateProvider: DateProvider): number {
    const remaining = Deadline.toMs(deadline) - dateProvider.monotonic();
    return Math.max(0, Math.floor(remaining));
  },

  /** Wait until the deadline has expired. Loops to handle wall-clock jumps during sleep. */
  async waitUntilExpired(deadline: Deadline, dateProvider: DateProvider): Promise<void> {
    while (!Deadline.hasExpired(deadline, dateProvider)) {
      const sleepMs = Deadline.remainingMs(deadline, dateProvider);
      if (sleepMs > 0) {
        await sleep(sleepMs);
      }
    }
  },
};
