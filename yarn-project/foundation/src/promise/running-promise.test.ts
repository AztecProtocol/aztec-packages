import { jest } from '@jest/globals';

import { type Logger, createLogger } from '../log/pino-logger.js';
import { type ErrorHandler, RunningPromise } from './running-promise.js';

jest.useFakeTimers();

describe('RunningPromise', () => {
  let runningPromise: RunningPromise;
  let counter: number;
  let fn: jest.Mock<() => Promise<void>>;
  let logger: Logger;
  let errorHandler: jest.Mock<ErrorHandler>;

  beforeEach(() => {
    counter = 0;
    fn = jest.fn(() => {
      counter++;
      return Promise.resolve();
    });
    errorHandler = jest.fn();
    logger = createLogger('test');
    runningPromise = new RunningPromise(fn, logger, 50, errorHandler);
  });

  afterEach(async () => {
    await runningPromise.stop();
  });

  describe('idempotency', () => {
    it('a second start does not spawn a second poll loop', async () => {
      runningPromise.start();
      expect(counter).toEqual(1);
      expect(runningPromise.isRunning()).toBe(true);

      // Starting again while already running must be a no-op, not a second concurrent loop.
      runningPromise.start();
      expect(counter).toEqual(1);

      await jest.advanceTimersToNextTimerAsync();
      // Exactly one loop advanced the counter, not two.
      expect(counter).toEqual(2);
    });

    it('stop is safe to call when never started and when already stopped', async () => {
      await expect(runningPromise.stop()).resolves.toBeUndefined();

      runningPromise.start();
      await runningPromise.stop();
      expect(runningPromise.isRunning()).toBe(false);

      await expect(runningPromise.stop()).resolves.toBeUndefined();
      expect(runningPromise.isRunning()).toBe(false);
    });
  });

  describe('trigger', () => {
    it('immediately runs the function when not running and awaits for completion', async () => {
      await runningPromise.trigger();
      expect(counter).toEqual(1);
    });

    it('immediately runs the function if sleeping', async () => {
      expect(counter).toEqual(0);
      runningPromise.start();
      expect(counter).toEqual(1);

      await runningPromise.trigger();
      expect(counter).toEqual(2);
    });

    it('waits for current run to finish before triggering', async () => {
      runningPromise.start();
      expect(counter).toEqual(1);
      const promise = runningPromise.trigger();
      expect(counter).toEqual(1);
      await promise;
      expect(counter).toEqual(2);
    });
  });

  describe('handles errors', () => {
    beforeEach(() => {
      fn.mockImplementation(() => {
        counter++;
        return Promise.reject(new Error('ouch'));
      });
    });

    it('reports errors upstream', async () => {
      runningPromise.start();
      await Promise.resolve();

      expect(counter).toEqual(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(new Error('ouch'));
    });

    it('continues running even if fn errors', async () => {
      runningPromise.start();
      await Promise.resolve();

      expect(counter).toEqual(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);

      await jest.advanceTimersToNextTimerAsync();
      expect(counter).toEqual(2);
      expect(errorHandler).toHaveBeenCalledTimes(2);
    });

    it('stops immediately if told so by the error handler', async () => {
      errorHandler.mockReturnValueOnce(RunningPromise.EXIT);
      runningPromise.start();
      await Promise.resolve();

      expect(counter).toEqual(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000);
      expect(counter).toEqual(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);

      expect(runningPromise.isRunning()).toBeFalsy();
    });
  });
});
