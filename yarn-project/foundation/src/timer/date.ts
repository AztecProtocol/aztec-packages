import { createLogger } from '../log/pino-logger.js';
import type { MonotonicTimestampMs } from './monotonic_timestamp.js';

/** Returns current datetime. */
export class DateProvider {
  public now(): number {
    return Date.now();
  }

  public nowInSeconds(): number {
    return Math.floor(this.now() / 1000);
  }

  public nowAsDate(): Date {
    return new Date(this.now());
  }

  /** Monotonic time in milliseconds (immune to NTP adjustments) */
  public monotonic(): MonotonicTimestampMs {
    return performance.now() as MonotonicTimestampMs;
  }
}

/** Returns current datetime and allows to override it. */
export class TestDateProvider extends DateProvider {
  private offset = 0;
  private monotonicOffset = 0;

  constructor(private readonly logger = createLogger('foundation:test-date-provider')) {
    super();
  }

  public override now(): number {
    return Date.now() + this.offset;
  }

  public override monotonic(): MonotonicTimestampMs {
    return (performance.now() + this.monotonicOffset) as MonotonicTimestampMs;
  }

  /** Set wall-clock time. Also advances monotonic time by same delta (simulates real time passing). */
  public setTime(timeMs: number) {
    const now = Date.now();
    const delta = timeMs - now - this.offset;
    this.offset = timeMs - now;
    this.monotonicOffset += delta;
    this.logger.warn(`Time set to ${new Date(timeMs).toISOString()}`, { offset: this.offset, timeMs });
  }

  /** Advance only monotonic time (for testing clock jump scenarios). */
  public advanceMonotonic(ms: number) {
    this.monotonicOffset += ms;
  }

  /** Set wall-clock WITHOUT advancing monotonic (simulate NTP correction). */
  public setTimeWithoutMonotonic(timeMs: number) {
    this.offset = timeMs - Date.now();
    this.logger.warn(`Wall-clock time set to ${new Date(timeMs).toISOString()} (monotonic unchanged)`, {
      offset: this.offset,
      timeMs,
    });
  }
}
