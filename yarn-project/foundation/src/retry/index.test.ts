import { TimeoutError } from '../error/index.js';
import { ManualDateProvider } from '../timer/index.js';
import { retryUntil } from './index.js';

describe('retryUntil', () => {
  it('returns the truthy result once the function succeeds', async () => {
    let attempts = 0;
    const result = await retryUntil(
      () => {
        attempts++;
        return attempts >= 3 ? 'done' : undefined;
      },
      'eventually-true',
      5,
      0.01,
    );
    expect(result).toEqual('done');
    expect(attempts).toEqual(3);
  });

  describe('numeric timeout', () => {
    it('throws a TimeoutError after the numeric timeout elapses', async () => {
      await expect(retryUntil(() => undefined, 'never-true', 0.05, 0.01)).rejects.toThrow(TimeoutError);
    });

    it('never times out when the timeout is 0', async () => {
      let attempts = 0;
      const result = await retryUntil(
        () => {
          attempts++;
          return attempts >= 5 ? 'done' : undefined;
        },
        'no-timeout',
        0,
        0.01,
      );
      expect(result).toEqual('done');
    });
  });

  describe('{ timeout } shape', () => {
    it('behaves like the equivalent numeric timeout', async () => {
      await expect(retryUntil(() => undefined, 'never-true', { timeout: 0.05 }, 0.01)).rejects.toThrow(TimeoutError);
    });

    it('never times out when the timeout is 0', async () => {
      let attempts = 0;
      const result = await retryUntil(
        () => {
          attempts++;
          return attempts >= 4 ? 'done' : undefined;
        },
        'no-timeout',
        { timeout: 0 },
        0.01,
      );
      expect(result).toEqual('done');
    });
  });

  describe('{ deadline } shape', () => {
    it('derives the remaining budget from the deadline and throws once it elapses', async () => {
      // now=0, deadline=40ms → ~0.04s budget; the loop (interval 0.01s) times out after it elapses.
      const dateProvider = new ManualDateProvider(0);
      const deadline = new Date(40);
      await expect(retryUntil(() => undefined, 'deadline-elapsed', { deadline, dateProvider }, 0.01)).rejects.toThrow(
        TimeoutError,
      );
    });

    it('resolves before the deadline when the function succeeds in time', async () => {
      const dateProvider = new ManualDateProvider(0);
      const deadline = new Date(10_000);
      let attempts = 0;
      const result = await retryUntil(
        () => {
          attempts++;
          return attempts >= 2 ? 'done' : undefined;
        },
        'deadline-in-future',
        { deadline, dateProvider },
        0.01,
      );
      expect(result).toEqual('done');
    });

    it('times out immediately when the deadline is already in the past', async () => {
      const dateProvider = new ManualDateProvider(10_000);
      const deadline = new Date(5_000);
      const start = Date.now();
      await expect(retryUntil(() => undefined, 'past-deadline', { deadline, dateProvider }, 0.01)).rejects.toThrow(
        TimeoutError,
      );
      // Should not have spent anywhere near a full second; it must time out on the first interval.
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('falls back to Date.now when no dateProvider is supplied', async () => {
      const deadline = new Date(Date.now() - 1_000);
      await expect(retryUntil(() => undefined, 'past-deadline-real-clock', { deadline }, 0.01)).rejects.toThrow(
        TimeoutError,
      );
    });
  });
});
