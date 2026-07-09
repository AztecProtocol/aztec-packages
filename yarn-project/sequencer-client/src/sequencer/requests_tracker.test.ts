import { promiseWithResolvers } from '@aztec/foundation/promise';

import { describe, expect, it, jest } from '@jest/globals';

import { RequestsTracker } from './requests_tracker.js';

describe('RequestsTracker', () => {
  it('starts empty', () => {
    expect(new RequestsTracker().size).toBe(0);
  });

  it('tracks an in-flight request and drops it once it settles', async () => {
    const tracker = new RequestsTracker();
    const { promise, resolve } = promiseWithResolvers<void>();

    tracker.trackRequest(promise);
    expect(tracker.size).toBe(1);

    resolve();
    await tracker.awaitRequests();
    expect(tracker.size).toBe(0);
  });

  it('drops a rejected request without awaitRequests throwing', async () => {
    const tracker = new RequestsTracker();
    const { promise, reject } = promiseWithResolvers<void>();

    tracker.trackRequest(promise);
    reject(new Error('boom'));

    await expect(tracker.awaitRequests()).resolves.toBeUndefined();
    expect(tracker.size).toBe(0);
  });

  it('awaitRequests waits for every in-flight request', async () => {
    const tracker = new RequestsTracker();
    const first = promiseWithResolvers<void>();
    const second = promiseWithResolvers<void>();
    tracker.trackRequest(first.promise);
    tracker.trackRequest(second.promise);

    let settled = false;
    const awaiting = tracker.awaitRequests().then(() => (settled = true));

    first.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    second.resolve();
    await awaiting;
    expect(settled).toBe(true);
    expect(tracker.size).toBe(0);
  });

  it('interruptRequests invokes the interrupt callback of each in-flight request', async () => {
    const tracker = new RequestsTracker();
    const first = promiseWithResolvers<void>();
    const second = promiseWithResolvers<void>();
    const interruptFirst = jest.fn();
    const interruptSecond = jest.fn();
    tracker.trackRequest(first.promise, interruptFirst);
    tracker.trackRequest(second.promise, interruptSecond);

    tracker.interruptRequests();

    expect(interruptFirst).toHaveBeenCalledTimes(1);
    expect(interruptSecond).toHaveBeenCalledTimes(1);

    first.resolve();
    second.resolve();
    await tracker.awaitRequests();
  });

  it('does not interrupt requests that already settled', async () => {
    const tracker = new RequestsTracker();
    const { promise, resolve } = promiseWithResolvers<void>();
    const interrupt = jest.fn();
    tracker.trackRequest(promise, interrupt);

    resolve();
    await tracker.awaitRequests();

    tracker.interruptRequests();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('tolerates a request tracked without an interrupt callback', async () => {
    const tracker = new RequestsTracker();
    const { promise, resolve } = promiseWithResolvers<void>();
    tracker.trackRequest(promise);

    expect(() => tracker.interruptRequests()).not.toThrow();

    resolve();
    await tracker.awaitRequests();
  });
});
