import { TimeoutError } from '../error/index.js';
import { type Logger, createLogger } from '../log/index.js';
import { sleep } from '../sleep/index.js';
import { type DateProvider, Timer } from '../timer/index.js';

/** An error that indicates that the operation should not be retried. */
export class NoRetryError extends Error {}

/**
 * Generates a backoff sequence for retrying operations with an increasing delay.
 * The backoff sequence follows this pattern: 1, 1, 1, 2, 4, 8, 16, 32, 64, ...
 * This generator can be used in combination with the `retry` function to perform
 * retries with exponential backoff and capped at 64 seconds between attempts.
 *
 * @returns A generator that yields the next backoff value in seconds as an integer.
 */
export function* backoffGenerator() {
  const v = [1, 1, 1, 2, 4, 8, 16, 32, 64];
  let i = 0;
  while (true) {
    yield v[Math.min(i++, v.length - 1)];
  }
}

/**
 * Generates a backoff sequence based on the array of retry intervals to use with the `retry` function.
 * @param retries - Intervals to retry (in seconds).
 * @returns A generator sequence.
 */
export function* makeBackoff(retries: number[]) {
  for (const retry of retries) {
    yield retry;
  }
}

/**
 * Retry a given asynchronous function with a specific backoff strategy, until it succeeds or backoff generator ends.
 * It logs the error and retry interval in case an error is caught. The function can be named for better log output.
 *
 * @param fn - The asynchronous function to be retried.
 * @param name - The optional name of the operation, used for logging purposes.
 * @param backoff - The optional backoff generator providing the intervals in seconds between retries. Defaults to a predefined series.
 * @param log - Logger to use for logging.
 * @param failSilently - Do not log errors while retrying.
 * @returns A Promise that resolves with the successful result of the provided function, or rejects if backoff generator ends.
 * @throws If `NoRetryError` is thrown by the `fn`, it is rethrown.
 */
export async function retry<Result>(
  fn: () => Promise<Result>,
  name = 'Operation',
  backoff = backoffGenerator(),
  log: Logger = createLogger('foundation:retry'),
  failSilently = false,
) {
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof NoRetryError) {
        // A special error that indicates that the operation should not be retried. Rethrow it.
        throw err;
      }
      const s = backoff.next().value;
      if (s === undefined) {
        throw err;
      }
      log?.debug(`${name} failed. Will retry in ${s}s...`);
      !failSilently && log?.error(`Error while retrying ${name}`, err);
      await sleep(s * 1000);
      continue;
    }
  }
}

/**
 * Timeout specification accepted by {@link retryUntil}. Either a plain number of seconds, an explicit
 * `{ timeout }` in seconds, or an absolute `{ deadline }` with an optional {@link DateProvider} used to
 * read the current time. A deadline is converted to the remaining seconds at call time; a deadline that
 * has already passed yields a zero remaining budget, matching the immediate-timeout semantics of a
 * non-positive numeric timeout.
 */
export type RetryUntilTimeout = number | { timeout: number } | { deadline: Date; dateProvider?: DateProvider };

/**
 * Resolves a {@link RetryUntilTimeout} to a numeric timeout in seconds for the legacy timer-based loop.
 * A numeric/`{ timeout }` value passes through unchanged (0 means never time out, negative times out on the
 * first interval). A `{ deadline }` is the remaining seconds until the deadline; when the deadline is already
 * at or past `now` it resolves to a negative value so the loop times out immediately instead of being read as
 * the never-timeout sentinel 0.
 */
function resolveRetryUntilTimeoutSeconds(timeout: RetryUntilTimeout): number {
  if (typeof timeout === 'number') {
    return timeout;
  }
  if ('deadline' in timeout) {
    const now = timeout.dateProvider?.now() ?? Date.now();
    const remainingSeconds = (timeout.deadline.getTime() - now) / 1000;
    return remainingSeconds > 0 ? remainingSeconds : -1;
  }
  return timeout.timeout;
}

/**
 * Retry an asynchronous function until it returns a truthy value or the specified timeout is exceeded.
 * The function is retried periodically with a fixed interval between attempts. The operation can be named for better error messages.
 * Will never timeout if the value is 0.
 *
 * @param fn - The asynchronous function to be retried, which should return a truthy value upon success or undefined otherwise.
 * @param name - The optional name of the operation, used for generating timeout error message.
 * @param timeout - The maximum time to keep retrying before throwing a timeout error. Accepts a number of
 * seconds (0 = never time out), an explicit `{ timeout }` in seconds, or an absolute `{ deadline }` with an
 * optional `dateProvider`. A deadline already in the past times out on the first interval, the same as a
 * zero/negative numeric timeout. Defaults to 0 (never timeout).
 * @param interval - The optional interval, in seconds, between retry attempts. Defaults to 1 second.
 * @returns A Promise that resolves with the successful (truthy) result of the provided function, or rejects if timeout is exceeded.
 */
export async function retryUntil<T>(
  fn: () => (T | undefined) | Promise<T | undefined>,
  name = '',
  timeout: RetryUntilTimeout = 0,
  interval = 1,
) {
  const timeoutSeconds = resolveRetryUntilTimeoutSeconds(timeout);
  const timer = new Timer();
  while (true) {
    const result = await fn();
    if (result) {
      return result;
    }

    await sleep(interval * 1000);

    if (timeoutSeconds && timer.s() > timeoutSeconds) {
      throw new TimeoutError(name ? `Timeout awaiting ${name}` : 'Timeout');
    }
  }
}

/**
 * Retry an asynchronous function until it returns a truthy value or the maximum number of retries is exceeded.
 * The function is retried periodically with a fixed interval between attempts.
 *
 * @param fn - The asynchronous function to be retried, which should return a truthy value upon success or undefined otherwise.
 * @param name - The optional name of the operation, used for generating error messages.
 * @param maxRetries - The maximum number of retry attempts before throwing an error.
 * @param retryInterval - The optional interval, in seconds, between retry attempts. Defaults to 1 second.
 * @returns A Promise that resolves with the successful (truthy) result of the provided function, or rejects if retries are exhausted.
 */
export async function retryTimes<T>(
  fn: () => (T | undefined) | Promise<T | undefined>,
  name = '',
  maxRetries: number,
  retryInterval = 1,
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    if (result) {
      return result;
    }

    if (attempt < maxRetries) {
      await sleep(retryInterval * 1000);
    }
  }

  throw new Error(name ? `Retries exhausted awaiting ${name}` : 'Retries exhausted');
}

/**
 * Convenience wrapper around retryUntil with fast polling for tests.
 * Uses 10s timeout and 100ms polling interval by default.
 *
 * @param fn - The function to retry until it returns a truthy value.
 * @param name - Description of what we're waiting for (for error messages).
 * @param timeout - Optional timeout in seconds. Defaults to 10s.
 * @param interval - Optional interval in seconds. Defaults to 0.1s (100ms).
 */
export function retryFastUntil<T>(
  fn: () => (T | undefined) | Promise<T | undefined>,
  name = '',
  timeout = 10,
  interval = 0.1,
) {
  return retryUntil(fn, name, timeout, interval);
}
