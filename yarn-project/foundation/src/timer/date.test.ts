import { sleep } from '../sleep/index.js';
import { TestDateProvider } from './date.js';
import { Deadline } from './deadline.js';
import type { MonotonicTimestampMs } from './monotonic_timestamp.js';

/**
 * Standard tolerance for time-based assertions in tests (in milliseconds).
 * Accounts for test execution overhead, timing drift, and sleep precision.
 */
const TIME_TOLERANCE_MS = 100;

// Custom Jest matchers for time comparisons with tolerance

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      /**
       * Asserts that a timestamp is close to the expected time, with tolerance after.
       * Checks that: expected <= actual < expected + TIME_TOLERANCE_MS
       */
      toBeCloseToTimeWithToleranceAfter(expected: number): R;
      /**
       * Asserts that a timestamp is close to the expected time, with tolerance before.
       * Checks that: expected - TIME_TOLERANCE_MS < actual <= expected
       */
      toBeCloseToTimeWithToleranceBefore(expected: number): R;
    }
  }
}

expect.extend({
  toBeCloseToTimeWithToleranceAfter(received: number, expected: number) {
    const pass = received >= expected && received < expected + TIME_TOLERANCE_MS;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be within [${expected}, ${expected + TIME_TOLERANCE_MS})`
          : `expected ${received} to be within [${expected}, ${expected + TIME_TOLERANCE_MS}) but it was ${
              received < expected ? 'too early' : 'too late'
            }`,
    };
  },
  toBeCloseToTimeWithToleranceBefore(received: number, expected: number) {
    const lowerBound = expected - TIME_TOLERANCE_MS;
    const pass = received > lowerBound && received <= expected;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be within (${lowerBound}, ${expected}]`
          : `expected ${received} to be within (${lowerBound}, ${expected}] but it was ${
              received <= lowerBound ? 'too early' : 'too late'
            }`,
    };
  },
});

describe('TestDateProvider', () => {
  let dateProvider: TestDateProvider;
  beforeEach(() => {
    dateProvider = new TestDateProvider();
  });

  it('should return the current datetime', () => {
    const currentTime = Date.now();
    const result = dateProvider.now();
    expect(result).toBeCloseToTimeWithToleranceAfter(currentTime);
  });

  it('should return the overridden datetime', () => {
    const overriddenTime = Date.now() + 1000;
    dateProvider.setTime(overriddenTime);
    const result = dateProvider.now();
    expect(result).toBeCloseToTimeWithToleranceAfter(overriddenTime);
  });

  it('should keep ticking after overriding', async () => {
    const overriddenTime = Date.now() + 1000;
    dateProvider.setTime(overriddenTime);
    await sleep(510);
    const result = dateProvider.now();
    expect(result).toBeCloseToTimeWithToleranceAfter(overriddenTime + 500);
  });

  describe('monotonic time', () => {
    it('should advance monotonic time when setTime is called', () => {
      const initialMonotonic = dateProvider.monotonic();

      // Advance wall-clock time by 5 seconds
      const futureTime = Date.now() + 5000;
      dateProvider.setTime(futureTime);

      const newMonotonic = dateProvider.monotonic();
      // Monotonic should have advanced by approximately 5 seconds
      expect(newMonotonic - initialMonotonic).toBeCloseToTimeWithToleranceAfter(5000);
    });

    it('should only advance monotonic time when advanceMonotonic is called', () => {
      const initialWallClock = dateProvider.now();
      const initialMonotonic = dateProvider.monotonic();

      // Advance only monotonic time by 3 seconds
      dateProvider.advanceMonotonic(3000);

      // Wall-clock should be roughly the same (within timing tolerance)
      expect(dateProvider.now() - initialWallClock).toBeLessThan(TIME_TOLERANCE_MS);
      // Monotonic should have advanced by 3 seconds
      const newMonotonic = dateProvider.monotonic();
      expect(newMonotonic - initialMonotonic).toBeCloseToTimeWithToleranceAfter(3000);
    });

    it('should only advance wall-clock when setTimeWithoutMonotonic is called', () => {
      const initialMonotonic = dateProvider.monotonic();

      // Advance only wall-clock time by 10 seconds
      const futureTime = Date.now() + 10000;
      dateProvider.setTimeWithoutMonotonic(futureTime);

      // Monotonic should be roughly the same (within timing tolerance)
      const newMonotonic = dateProvider.monotonic();
      expect(newMonotonic - initialMonotonic).toBeLessThan(TIME_TOLERANCE_MS);
      // Wall-clock should show the new time
      expect(dateProvider.now()).toBeGreaterThanOrEqual(futureTime);
    });

    it('should maintain separate offsets for wall-clock and monotonic time', () => {
      // First, set wall-clock to a specific time (advances both)
      const time1 = Date.now() + 5000;
      dateProvider.setTime(time1);

      // Then, advance only monotonic
      dateProvider.advanceMonotonic(2000);

      // Then, set wall-clock without affecting monotonic
      const time2 = Date.now() + 20000;
      dateProvider.setTimeWithoutMonotonic(time2);

      // Wall-clock should reflect time2
      expect(dateProvider.now()).toBeGreaterThanOrEqual(time2);
      // Monotonic should be approximately 5000 + 2000 + small elapsed time
      const monotonicValue = dateProvider.monotonic();
      expect(monotonicValue).toBeGreaterThan(7000);
    });
  });
});

describe('Deadline', () => {
  let dateProvider: TestDateProvider;
  beforeEach(() => {
    dateProvider = new TestDateProvider();
  });

  it('should create deadline from monotonic timestamp', () => {
    const timestamp = dateProvider.monotonic();
    const deadline = Deadline.at(timestamp);
    expect(Deadline.toMs(deadline)).toBe(timestamp);
  });

  it('should correctly detect expired deadlines', () => {
    const currentMonotonic = dateProvider.monotonic();

    // Create a deadline in the past
    const pastDeadline = Deadline.at((currentMonotonic - 1000) as MonotonicTimestampMs);
    expect(Deadline.hasExpired(pastDeadline, dateProvider)).toBe(true);

    // Create a deadline in the future
    const futureDeadline = Deadline.at((currentMonotonic + 10000) as MonotonicTimestampMs);
    expect(Deadline.hasExpired(futureDeadline, dateProvider)).toBe(false);
  });

  it('should be immune to wall-clock jumps', () => {
    const currentMonotonic = dateProvider.monotonic();

    // Create a deadline 5 seconds in the future (monotonic)
    const deadline = Deadline.at((currentMonotonic + 5000) as MonotonicTimestampMs);

    // Deadline should not be expired
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(false);

    // Jump wall-clock forward by 10 seconds (simulating NTP correction)
    const futureWallClock = Date.now() + 10000;
    dateProvider.setTimeWithoutMonotonic(futureWallClock);

    // Deadline should STILL not be expired because it uses monotonic time
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(false);

    // Advance monotonic time by 4.9 seconds (just before deadline)
    dateProvider.advanceMonotonic(4900);

    // Deadline should NOT be expired yet
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(false);

    // Advance well past the deadline
    dateProvider.advanceMonotonic(200);

    // Now deadline should be expired
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(true);
  });

  it('should use strictly greater than for expiration check', () => {
    // Create a deadline 1 second in the future
    const currentMonotonic = dateProvider.monotonic();
    const deadline = Deadline.at((currentMonotonic + 1000) as MonotonicTimestampMs);

    // Not expired yet
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(false);

    // Advance to just before deadline (accounting for timing drift)
    dateProvider.advanceMonotonic(900);
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(false);

    // Advance well past the deadline
    dateProvider.advanceMonotonic(200);
    expect(Deadline.hasExpired(deadline, dateProvider)).toBe(true);
  });

  it('should return correct remaining time', () => {
    const currentMonotonic = dateProvider.monotonic();

    // Create a deadline 5 seconds in the future
    const deadline = Deadline.at((currentMonotonic + 5000) as MonotonicTimestampMs);

    // Remaining time should be approximately 5 seconds
    const remaining = Deadline.remainingMs(deadline, dateProvider);
    expect(remaining).toBeCloseToTimeWithToleranceBefore(5000);

    // Advance monotonic time by 3 seconds
    dateProvider.advanceMonotonic(3000);

    // Remaining time should be approximately 2 seconds
    const remaining2 = Deadline.remainingMs(deadline, dateProvider);
    expect(remaining2).toBeCloseToTimeWithToleranceBefore(2000);

    // Advance past the deadline
    dateProvider.advanceMonotonic(3000);

    // Remaining time should be 0 (not negative)
    expect(Deadline.remainingMs(deadline, dateProvider)).toBe(0);
  });
});
