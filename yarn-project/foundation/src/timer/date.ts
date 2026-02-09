import { createLogger } from '../log/pino-logger.js';

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
}

/** Returns current datetime and allows to override it. */
export class TestDateProvider extends DateProvider {
  private offset = 0;

  constructor(private readonly logger = createLogger('foundation:test-date-provider')) {
    super();
  }

  public override now(): number {
    return Date.now() + this.offset;
  }

  public setTime(timeMs: number) {
    this.offset = timeMs - Date.now();
    this.logger.warn(`Time set to ${new Date(timeMs).toISOString()}`, { offset: this.offset, timeMs });
  }

  /** Advances the time by the given number of seconds. */
  public advanceTime(seconds: number) {
    this.offset += seconds * 1000;
  }
}

/**
 * A date provider for tests that only advances time via explicit advanceTime() calls.
 * Unlike TestDateProvider, this does NOT track real time progression - time is completely
 * frozen until explicitly advanced. This eliminates flakiness from tests taking
 * varying amounts of real time to execute.
 */
export class ManualDateProvider extends DateProvider {
  private currentTimeMs: number;

  /**
   * @param initialTimeMs - Initial time in milliseconds. Defaults to a round timestamp for easy visualization.
   */
  constructor(initialTimeMs: number = Date.UTC(2025, 0, 1, 0, 0, 0)) {
    super();
    this.currentTimeMs = initialTimeMs;
  }

  public override now(): number {
    return this.currentTimeMs;
  }

  /** Sets the current time to the given timestamp in milliseconds. */
  public setTime(timeMs: number) {
    this.currentTimeMs = timeMs;
  }

  /** Advances the time by the given number of seconds. */
  public advanceTime(seconds: number) {
    this.currentTimeMs += seconds * 1000;
  }

  /** Advances the time by the given number of milliseconds. */
  public advanceTimeMs(ms: number) {
    this.currentTimeMs += ms;
  }
}
