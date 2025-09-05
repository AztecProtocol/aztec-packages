import { DateProvider } from '../timer/date.js';

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

/**
 * Helper function that waits for a predicate to become true.
 * @param pred - The predicate function to evaluate
 * @param interval - The interval in milliseconds to check the predicate (default: 10ms)
 * @param timeout - The maximum time in milliseconds to wait before rejecting (default: 5000ms)
 * @param dateProvider - An optional DateProvider instance for getting the current time (default: new DateProvider())
 */
export function waitFor(pred: () => boolean, interval = 10, timeout = 5_000, dateProvider = new DateProvider()) {
  const started = dateProvider.now();
  return new Promise<void>((resolve, reject) => {
    const id = setInterval(() => {
      if (pred()) {
        clearInterval(id);
        resolve();
      } else if (dateProvider.now() - started >= timeout) {
        clearInterval(id);
        reject(new Error('waitFor: timeout'));
      }
    }, interval);
  });
}
