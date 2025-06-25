import { sleep } from '../sleep/index.js';
import { Timer } from '../timer/timer.js';
import { SerialQueue } from './serial_queue.js';

describe('SerialQueue', () => {
  let queue: SerialQueue;
  let startSignals = new Array<boolean>();
  let endSignals = new Array<boolean>();
  let flag = false;

  const enqueuedFunction = async (index: number) => {
    startSignals[index] = true;
    while (!flag) {
      // Wait for flag to be set
      await sleep(10);
    }
    endSignals[index] = true;
  };

  const waitForJobs = async (timeoutSeconds: number) => {
    const timer = new Timer();
    let timedOut = false;
    while (startSignals.some(signal => !signal) && !timedOut) {
      await sleep(10);
      if (timer.s() > timeoutSeconds) {
        timedOut = true;
      }
    }
    // all start signals have been triggered
    // check that no end signals have been triggered
    expect(endSignals.some(signal => signal)).toBe(false);
    flag = true;
    return timedOut;
  };

  beforeEach(() => {
    queue = new SerialQueue();
  });

  afterEach(async () => {
    await queue.end();
  });

  it('processes multiple jobs concurrently', async () => {
    const numConcurrentJobs = 8;
    queue.start(8);
    startSignals = new Array(numConcurrentJobs).fill(false);
    endSignals = new Array(numConcurrentJobs).fill(false);
    const promises = Array.from({ length: numConcurrentJobs }).map((_, i) => queue.put(() => enqueuedFunction(i)));
    const timeout = await waitForJobs(30);
    await Promise.all(promises);
    expect(endSignals.every(signal => signal)).toBe(true);
    expect(timeout).toBe(false);
  });
});
