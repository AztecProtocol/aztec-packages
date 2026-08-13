/**
 * Like `Promise.all`, but runs every promise to completion before resolving or rejecting.
 *
 * `Promise.all` rejects as soon as one input rejects, abandoning the still-running siblings. When those siblings have
 * side effects, the caller observes the rejection and reacts to the failure while the abandoned work is still
 * producing effects. This helper instead guarantees that by the time it rejects, no input is still running.
 *
 * The signature mirrors `Promise.all`'s declaration in TypeScript's standard library, so call sites type exactly as
 * they did with `Promise.all` (in particular, heterogeneous tuples keep their per-position types).
 */
export async function allToCompletion<T extends readonly unknown[] | []>(
  promises: T,
): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const results = await Promise.allSettled<unknown>(promises);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length === 1) {
    // Rethrow a lone failure as-is so error identity is preserved for callers that inspect error types.
    throw failures[0].reason;
  } else if (failures.length > 1) {
    throw new AggregateError(
      failures.map(failure => failure.reason),
      `${failures.length} of ${results.length} concurrent operations failed: ${failures
        .map(failure => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)))
        .join(' | ')}`,
    );
  }
  return results.map(result => (result as PromiseFulfilledResult<unknown>).value) as {
    -readonly [P in keyof T]: Awaited<T[P]>;
  };
}

export type PromiseWithResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
};

/**
 * A polyfill for the Promise.withResolvers proposed API.
 * @see https://github.com/tc39/proposal-promise-with-resolvers
 * @returns A promise with resolvers.
 */
export function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  // use ! operator to avoid TS error
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;

  // the ES spec guarantees that the promise executor is called synchronously
  // so the resolve and reject functions will be defined
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
