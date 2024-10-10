import { sleep } from '../sleep/index.js';
import { RunningPromise } from './running-promise.js';

describe('RunningPromise', () => {
  let runningPromise: RunningPromise;
  let counter: number;
  let fn: () => Promise<void>;

  beforeEach(() => {
    counter = 0;
    fn = async () => {
      counter++;
      await sleep(100);
    };
    runningPromise = new RunningPromise(fn, 50);
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
  });
});
