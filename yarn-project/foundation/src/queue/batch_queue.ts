import { createLogger } from '../log/pino-logger.js';
import { type PromiseWithResolvers, promiseWithResolvers } from '../promise/utils.js';
import { FifoMemoryQueue } from './fifo_memory_queue.js';

type Batch<T, K> = {
  items: Array<T>;
  key: K;
  deferred: PromiseWithResolvers<void>;
  enqueueTimeout: ReturnType<typeof setTimeout>;
};

/**
 * A queue that groups items into batches based on a group key.
 *
 * The batching algorithm is greedy, meaning that as long as consecutive items have the same group key then they will
 * be batched together. As soon as an item with a different group key is encountered, the old batch is flushed to the
 * queue and a new batch is started.
 *
 * A batch can also be flushed to the queue if:
 * - it reaches the selected batch size limit
 * - or the batch duration limit is hit (in milliseconds)
 *
 * This ensures that batches don't grow too big and that they are flushed at a minimum rate of 1 batch every interval.
 *
 * The consumer side of this queue will process batches as quickly as possible.
 */
export class BatchQueue<T, K extends string | number> {
  private container = new FifoMemoryQueue<Batch<T, K>>();
  private currentBatch?: Batch<T, K>;
  private runningPromise?: Promise<void>;

  constructor(
    private processBatch: (items: Array<T>, key: K) => void | Promise<void>,
    private maxBatchSize: number,
    private maxBatchDuration: number,
    private log = createLogger('foundation:batch_queue'),
  ) {}

  /**
   * Put an item in the queue. It will be routed based on the given key
   * @param item - The item to add
   * @param key - The group key for this item
   * @returns A promise that resolves or rejects when the batch this item is part of is processed
   */
  public put(item: T, key: K): Promise<void> {
    if (!this.runningPromise) {
      return Promise.reject(new Error('BatchQueue is not started'));
    }

    let currentBatch = this.currentBatch;
    if (!currentBatch || currentBatch.key !== key || currentBatch.items.length >= this.maxBatchSize) {
      this.flushCurrentBatch();

      this.log.trace('Creating new batch', { key });
      currentBatch = {
        items: [],
        key,
        deferred: promiseWithResolvers(),
        enqueueTimeout: setTimeout(this.flushCurrentBatch, this.maxBatchDuration),
      };

      this.currentBatch = currentBatch;
    }

    currentBatch.items.push(item);
    if (currentBatch.items.length >= this.maxBatchSize) {
      this.flushCurrentBatch();
    }

    return currentBatch.deferred.promise;
  }

  /**
   * Immediately flushes the current batch, starting a new one
   */
  public flushCurrentBatch = (): void => {
    if (this.currentBatch) {
      this.log.trace('Flushing batch', { size: this.currentBatch.items.length, key: this.currentBatch.key });
      clearTimeout(this.currentBatch.enqueueTimeout);
      this.container.put(this.currentBatch);
      this.currentBatch = undefined;
    }
  };

  /**
   * Starts the queue.
   */
  public start() {
    if (this.runningPromise) {
      return;
    }

    this.runningPromise = this.container.process(this.execProcessor);
  }

  /**
   * Stops the queue. Any items in the queue will continue to be processed but new items won't be accepted anymore
   * @returns A promise that resolves when the queue is drained completely
   */
  public stop(): Promise<void> {
    const runningPromise = this.runningPromise;
    this.runningPromise = undefined;

    if (!runningPromise) {
      return Promise.resolve();
    }

    this.container.end();
    return runningPromise;
  }

  private execProcessor = async (batch: Batch<T, K>): Promise<void> => {
    try {
      await this.processBatch(batch.items, batch.key);
      batch.deferred.resolve();
    } catch (err) {
      batch.deferred.reject(err);
    }
  };
}
