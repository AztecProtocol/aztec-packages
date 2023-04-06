import { sleep } from '../sleep/index.js';
import { Timer } from '../timer/index.js';

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
 * Retry a given asynchronous function with a specific backoff strategy, until it succeeds or backoff generator ends.
 * It logs the error and retry interval in case an error is caught. The function can be named for better log output.
 *
 * @param fn - The asynchronous function to be retried.
 * @param name - The optional name of the operation, used for logging purposes.
 * @param backoff - The optional backoff generator providing the intervals in seconds between retries. Defaults to a predefined series.
 * @returns A Promise that resolves with the successful result of the provided function, or rejects if backoff generator ends.
 */
export async function retry<Result>(fn: () => Promise<Result>, name = 'Operation', backoff = backoffGenerator()) {
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const s = backoff.next().value;
      if (s === undefined) {
        throw err;
      }
      console.log(`${name} failed. Will retry in ${s}s...`);
      console.log(err);
      await sleep(s * 1000);
      continue;
    }
  }
}

// Call `fn` repeatedly until it returns true or timeout.
// Both `interval` and `timeout` are seconds.
// Will never timeout if the value is 0.
export async function retryUntil<T>(fn: () => Promise<T | undefined>, name = '', timeout = 0, interval = 1) {
  const timer = new Timer();
  while (true) {
    const result = await fn();
    if (result) {
      return result;
    }

    await sleep(interval * 1000);

    if (timeout && timer.s() > timeout) {
      throw new Error(name ? `Timeout awaiting ${name}` : 'Timeout');
    }
  }
}
