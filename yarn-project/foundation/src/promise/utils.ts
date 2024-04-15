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

export type PromiseWithCallback<T> = [promise: Promise<T>, callback: (err: any, result: T) => void];

/**
 * Creates a promise and a node-style callback to resolve or reject it.
 * @returns - A tuple containing a promise and a callback function that resolves or rejects the promise.
 */
export function promiseWithCallback<T>(): PromiseWithCallback<T> {
  const { promise, resolve, reject } = promiseWithResolvers<T>();
  const callback = (err: any, result: T) => {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  };

  return [promise, callback];
}
