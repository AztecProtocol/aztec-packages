import { findInsertionIndexInSortedArray, insertIntoSortedArray } from '../array/sorted_array.js';
import { createLogger } from '../log/pino-logger.js';
import { promiseWithResolvers } from '../promise/utils.js';
import { sleep } from '../sleep/index.js';

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

  /**
   * Creates an AbortSignal that aborts after the specified timeout.
   * In production, this wraps AbortSignal.timeout(ms).
   * TestDateProvider overrides this to respect manipulated time.
   */
  public createTimeoutSignal(ms: number): AbortSignal {
    return AbortSignal.timeout(ms);
  }

  /**
   * Sleeps for the specified duration. Supports AbortSignal for cancellation.
   * TestDateProvider overrides this to resolve when setTime() advances past the deadline.
   */
  public sleep(ms: number): Promise<void> {
    return sleep(ms);
  }
}

type TestTimeout = { deadline: number; controller: AbortController };
type TestSleep = {
  deadline: number;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

const deadlineCmp = (a: { deadline: number }, b: { deadline: number }): -1 | 0 | 1 =>
  a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;

/** Returns current datetime and allows to override it. */
export class TestDateProvider extends DateProvider {
  private offset = 0;
  // sorted TestTimeout instances by their deadline
  private pendingTimeouts: TestTimeout[] = [];
  // sorted TestSleep instances by their deadline
  private pendingSleeps: TestSleep[] = [];

  constructor(private readonly logger = createLogger('foundation:test-date-provider')) {
    super();
  }

  public override now(): number {
    return Date.now() + this.offset;
  }

  public setTime(timeMs: number) {
    this.offset = timeMs - Date.now();
    this.logger.warn(`Time set to ${new Date(timeMs).toISOString()}`, { offset: this.offset, timeMs });
    this.handleTimeAdvance();
  }

  /**
   * Creates an AbortSignal that aborts when setTime() advances past the deadline.
   * Unlike the base DateProvider, this does NOT use real-time setTimeout.
   */
  public override createTimeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    const deadline = this.now() + ms;

    if (ms <= 0) {
      controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
      return controller.signal;
    }

    insertIntoSortedArray(this.pendingTimeouts, { deadline, controller }, deadlineCmp);
    return controller.signal;
  }

  /**
   * Sleeps for the specified duration. Resolves when setTime() advances past the deadline.
   * Unlike the base DateProvider, this does NOT use real-time setTimeout.
   */
  public override sleep(ms: number): Promise<void> {
    const deadline = this.now() + ms;

    if (ms <= 0) {
      return Promise.resolve();
    }

    const { promise, resolve, reject } = promiseWithResolvers<void>();
    insertIntoSortedArray(this.pendingSleeps, { deadline, resolve, reject }, deadlineCmp);

    return promise;
  }

  /** Check pending timeouts and sleeps, abort/resolve any that have expired. */
  private handleTimeAdvance() {
    const deadline = { deadline: this.now() };

    const timeoutIndex = findInsertionIndexInSortedArray(this.pendingTimeouts, deadline, deadlineCmp);
    if (timeoutIndex > 0) {
      const timeouts = this.pendingTimeouts.splice(0, timeoutIndex);
      for (const { controller } of timeouts) {
        setImmediate(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')));
      }
    }

    const sleepIdx = findInsertionIndexInSortedArray(this.pendingSleeps, deadline, deadlineCmp);
    if (sleepIdx > 0) {
      const sleeps = this.pendingSleeps.splice(0, sleepIdx);
      for (const { resolve } of sleeps) {
        setImmediate(resolve);
      }
    }
  }

  /** Clears all pending timeout and sleep timers. Call in afterEach to prevent Jest warnings. */
  public clearPendingTimeouts() {
    for (const { controller } of this.pendingTimeouts) {
      controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
    }
    for (const { reject } of this.pendingSleeps) {
      reject(new Error('TestDateProvider cleared'));
    }
    this.pendingTimeouts = [];
    this.pendingSleeps = [];
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
