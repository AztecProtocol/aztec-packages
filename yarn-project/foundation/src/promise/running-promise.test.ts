import { type Logger, createLogger } from '../log/pino-logger.js';
import { sleep } from '../sleep/index.js';
import { RunningPromise } from './running-promise.js';

describe('RunningPromise', () => {
  let runningPromise: RunningPromise;
  let counter: number;
  let fn: () => Promise<void>;
  let logger: Logger;

  beforeEach(() => {
    counter = 0;
    fn = async () => {
      counter++;
      await sleep(100);
    };
    logger = createLogger('test');
    runningPromise = new RunningPromise(fn, logger, 50);
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
      runningPromise.start();
      await sleep(110);
      expect(counter).toEqual(1);
      await runningPromise.trigger();
      expect(counter).toEqual(2);
    });

    it('waits for current run to finish before triggering', async () => {
      runningPromise.start();
      await sleep(10);
      expect(counter).toEqual(1);
      await runningPromise.trigger();
      expect(counter).toEqual(2);
    });

    it('handles errors', async () => {
      const failingFn = async () => {
        await fn();
        throw new Error('ouch');
      };
      runningPromise = new RunningPromise(failingFn, logger, 50);
      runningPromise.start();
      await sleep(90);
      expect(counter).toEqual(1);
    });

    class IgnoredError extends Error {
      constructor() {
        super('ignored');
        this.name = 'IgnoredError';
      }
    }

    it('handles ignored errors', async () => {
      const failingFn = async () => {
        await fn();
        throw new IgnoredError();
      };
      runningPromise = new RunningPromise(failingFn, logger, 50, [IgnoredError]);
      runningPromise.start();
      await sleep(90);
      expect(counter).toEqual(0);
    });
  });
});
