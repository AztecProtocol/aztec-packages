import { jest } from '@jest/globals';

import { type Logger, createLogger } from '../log/pino-logger.js';
import { type ErrorHandler, RunningPromise } from './running-promise.js';
import { promiseWithResolvers } from './utils.js';

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

    it('resolves only after a run that started after the call, even during a request-serving pass', async () => {
      const gates = [promiseWithResolvers<void>(), promiseWithResolvers<void>()];
      const log: string[] = [];
      fn.mockImplementation(async () => {
        const gate = gates[counter];
        counter++;
        const run = counter;
        log.push(`start:${run}`);
        await gate?.promise;
        log.push(`end:${run}`);
      });

      runningPromise.start();
      expect(counter).toEqual(1);

      // The first trigger is served by the pass that starts once the initial (gated) pass returns.
      const first = runningPromise.trigger().then(() => log.push('first'));
      gates[0].resolve();
      await jest.advanceTimersByTimeAsync(0);
      expect(counter).toEqual(2);
      expect(log).not.toContain('first');

      // The second trigger arrives while the pass serving the first one is in flight, so it must wait for a fresh
      // third pass rather than resolving off the pass that was already running.
      const second = runningPromise.trigger().then(() => log.push('second'));
      gates[1].resolve();
      await jest.advanceTimersByTimeAsync(0);
      await Promise.all([first, second]);

      expect(counter).toEqual(3);
      expect(log.indexOf('first')).toBeGreaterThan(log.indexOf('end:2'));
      expect(log.indexOf('second')).toBeGreaterThan(log.indexOf('end:3'));
    });

    it('rejects a pending trigger when stopped mid-pass', async () => {
      const gate = promiseWithResolvers<void>();
      fn.mockImplementation(() => {
        counter++;
        return counter === 1 ? gate.promise : Promise.resolve();
      });

      runningPromise.start();
      expect(counter).toEqual(1);

      const rejected = expect(runningPromise.trigger()).rejects.toThrow(
        'RunningPromise stopped before serving trigger',
      );
      const stopped = runningPromise.stop();
      gate.resolve();
      await stopped;

      await rejected;
      expect(counter).toEqual(1);
    });

    it('rejects a pending trigger when the error handler requests an exit', async () => {
      const gate = promiseWithResolvers<void>();
      fn.mockImplementation(async () => {
        counter++;
        await gate.promise;
        throw new Error('ouch');
      });
      errorHandler.mockReturnValue(RunningPromise.EXIT);

      runningPromise.start();
      expect(counter).toEqual(1);

      const rejected = expect(runningPromise.trigger()).rejects.toThrow(
        'RunningPromise stopped before serving trigger',
      );
      gate.resolve();
      await jest.advanceTimersByTimeAsync(0);

      await rejected;
      expect(runningPromise.isRunning()).toBe(false);
      expect(counter).toEqual(1);
    });

    it('resolves a trigger served by the pass in flight when stopped during that pass', async () => {
      const gate = promiseWithResolvers<void>();
      fn.mockImplementation(() => {
        counter++;
        return counter === 2 ? gate.promise : Promise.resolve();
      });

      runningPromise.start();
      expect(counter).toEqual(1);

      // The pass serving this trigger is already running when stop() is called, so the request is still served.
      const pending = runningPromise.trigger();
      await jest.advanceTimersByTimeAsync(0);
      expect(counter).toEqual(2);

      const stopped = runningPromise.stop();
      gate.resolve();
      await stopped;

      await expect(pending).resolves.toBeUndefined();
      expect(counter).toEqual(2);
    });
  });

  describe('lifecycle', () => {
    it('a second start does not spawn a second poll loop', async () => {
      runningPromise.start();
      expect(counter).toEqual(1);

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
    });

    it('can be restarted after a stop', async () => {
      runningPromise.start();
      expect(counter).toEqual(1);
      await runningPromise.stop();

      runningPromise.start();
      expect(runningPromise.isRunning()).toBe(true);
      expect(counter).toEqual(2);

      await jest.advanceTimersToNextTimerAsync();
      expect(counter).toEqual(3);
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
