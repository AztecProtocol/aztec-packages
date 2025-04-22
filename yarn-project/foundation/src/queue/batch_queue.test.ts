import { jest } from '@jest/globals';

import { range } from '../array/array.js';
import { promiseWithResolvers } from '../promise/utils.js';
import { sleep } from '../sleep/index.js';
import { BatchQueue } from './batch_queue.js';

describe('BatchQueue', () => {
  let queue: BatchQueue<number, number>;
  let intervalMs: number;
  let maxBatchSize: number;
  let processSpy: jest.Mock<(batch: number[]) => Promise<void>>;

  beforeEach(() => {
    intervalMs = 50;
    maxBatchSize = 5;
    processSpy = jest.fn();
    queue = new BatchQueue(processSpy, maxBatchSize, intervalMs);
    queue.start();
  });

  afterEach(async () => {
    await queue.stop();
  });

  it('puts items in batches up to provided limit', async () => {
    const promises: Promise<void>[] = [];
    const batches = 10;
    for (let i = 0; i < batches * maxBatchSize; i++) {
      promises.push(queue.put(i, 0));
    }

    await Promise.all(promises);
    expect(processSpy).toHaveBeenCalledTimes(batches);

    for (let i = 0; i < batches; i++) {
      expect(processSpy).toHaveBeenNthCalledWith(i + 1, range(maxBatchSize, i * maxBatchSize), 0);
    }
  });

  it('keeps batches unique by their key', async () => {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < maxBatchSize; i++) {
      promises.push(queue.put(i, i % 2));
    }

    await Promise.all(promises);

    // each batch should have a single item
    expect(processSpy).toHaveBeenCalledTimes(maxBatchSize);

    for (let i = 0; i < maxBatchSize; i++) {
      expect(processSpy).toHaveBeenNthCalledWith(i + 1, [i], i % 2);
    }
  });

  it('interleaves batches', async () => {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < Math.floor(maxBatchSize / 2); i++) {
      // 0, 2, 4, ...
      promises.push(queue.put(2 * i, 0));
    }

    for (let i = 0; i < Math.floor(maxBatchSize / 2); i++) {
      // 1, 3, 5, ...
      promises.push(queue.put(2 * i + 1, 1));
    }

    for (let i = Math.floor(maxBatchSize / 2); i < maxBatchSize; i++) {
      // n / 2, n / 2 + 2, ...
      promises.push(queue.put(2 * i, 0));
    }

    await Promise.all(promises);
    expect(processSpy).toHaveBeenCalledTimes(3);
    expect(processSpy).toHaveBeenNthCalledWith(
      1,
      range(Math.floor(maxBatchSize / 2), 0).map(i => 2 * i),
      0,
    );
    expect(processSpy).toHaveBeenNthCalledWith(
      2,
      range(Math.floor(maxBatchSize / 2), 0).map(i => 2 * i + 1),
      1,
    );
    expect(processSpy).toHaveBeenNthCalledWith(
      3,
      range(Math.ceil(maxBatchSize / 2), Math.floor(maxBatchSize / 2)).map(i => 2 * i),
      0,
    );
  });

  it('processes a batch at a time', async () => {
    const evensDeferred = promiseWithResolvers<void>();
    const oddsDeferred = promiseWithResolvers<void>();
    processSpy.mockReturnValueOnce(evensDeferred.promise).mockReturnValueOnce(oddsDeferred.promise);

    const evensDone = jest.fn();
    const oddsDone = jest.fn();

    void Promise.all([queue.put(0, 0), queue.put(2, 0), queue.put(4, 0)]).then(evensDone);
    void Promise.all([queue.put(1, 1), queue.put(3, 1)]).then(oddsDone);

    evensDeferred.resolve();

    await sleep(1);

    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledWith([0, 2, 4], 0);

    expect(evensDone).toHaveBeenCalled();
    expect(oddsDone).not.toHaveBeenCalled();

    expect(evensDone).toHaveBeenCalled();
    expect(oddsDone).not.toHaveBeenCalled();

    oddsDeferred.resolve();
    await sleep(intervalMs);

    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(processSpy).toHaveBeenLastCalledWith([1, 3], 1);
    expect(oddsDone).toHaveBeenCalled();

    expect(oddsDone).toHaveBeenCalled();
  });

  it('returns a promise that rejects if processing fails', async () => {
    const deferred = promiseWithResolvers<void>();
    processSpy.mockReturnValueOnce(deferred.promise);
    const evensError = jest.fn();
    const oddsDone = jest.fn();
    void Promise.all([queue.put(0, 0), queue.put(2, 0), queue.put(4, 0)]).catch(evensError);
    void Promise.all([queue.put(1, 1), queue.put(3, 1)]).then(oddsDone);

    deferred.reject(new Error('test error'));
    await sleep(intervalMs);

    expect(processSpy).toHaveBeenCalledTimes(2);
    expect(processSpy).toHaveBeenNthCalledWith(1, [0, 2, 4], 0);
    expect(processSpy).toHaveBeenNthCalledWith(2, [1, 3], 1);

    expect(evensError).toHaveBeenCalledWith(new Error('test error'));
    expect(oddsDone).toHaveBeenCalled();
  });

  it('refuses to enqueue if queue is not started', async () => {
    await queue.stop();
    await expect(queue.put(1, 1)).rejects.toBeDefined();
  });

  it('clears all the accumulated batches before stopping', async () => {
    const promises: Promise<void>[] = [];
    const batches = 10;
    for (let i = 0; i < batches * maxBatchSize; i++) {
      promises.push(queue.put(i, 0));
    }

    await queue.stop();
    // can't add any more
    await expect(queue.put(1, 1)).rejects.toBeDefined();

    expect(processSpy).toHaveBeenCalledTimes(batches);
  });
});
