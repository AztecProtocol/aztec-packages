import { sleep } from '../sleep/index.js';
import { Timer } from '../timer/index.js';

/**
 * Generates a backoff sequence iterator for exponential backoff with pre-defined values.
 * The iterator will yield a series of time intervals (in seconds) to be used for backing off
 * in error handling scenarios. The sequence is [1, 1, 1, 2, 4, 8, 16, 32, 64] and will not exceed 64.
 *
 * @yields {number} The next value in the backoff sequence.
 */
export function* backoffGenerator() {
  const v = [1, 1, 1, 2, 4, 8, 16, 32, 64];
  let i = 0;
  while (true) {
    yield v[Math.min(i++, v.length - 1)];
  }
}

/**
 * Retry executing the provided asynchronous function until it is successful, using a backoff strategy.
 * The `backoff` generator determines the waiting time between retries. It defaults to the `backoffGenerator` function
 * which increases the waiting time exponentially. The operation can be named for better error logging.
 * If the backoff generator stops producing new values (returns undefined), the latest error will be thrown.
 *
 * @param fn - The asynchronous function to execute and retry if it fails.
 * @param name - Optional name of the operation for better error logging.
 * @param backoff - Optional custom backoff generator, defaults to exponential backoff.
 * @returns A Promise that resolves with the successful result or rejects with the latest error after all retries fail.
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
