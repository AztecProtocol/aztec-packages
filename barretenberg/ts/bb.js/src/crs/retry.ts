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
 * @param backoff - The optional backoff generator providing the intervals in seconds between retries. Defaults to a predefined series.
 * @returns A Promise that resolves with the successful result of the provided function, or rejects if backoff generator ends.
 * @throws If `NoRetryError` is thrown by the `fn`, it is rethrown.
 */
export async function retry<Result>(fn: () => Promise<Result>, backoff = backoffGenerator()) {
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const s = backoff.next().value;
      if (s === undefined) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, s * 1000));
      continue;
    }
  }
}
