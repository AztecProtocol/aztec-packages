import { TimeoutError } from '../error/index.js';
import { createDebugLogger } from '../log/index.js';

export abstract class BaseMemoryQueue<T> {
  private waiting: ((item: T | null) => void)[] = [];
  private flushing = false;

  constructor(private log = createDebugLogger('aztec:foundation:memory_fifo')) {}

  protected abstract get items(): {
    length: number;
    get(): T | undefined;
    put(item: T): void;
    clear: () => void;
  };

  /**
   * Returns the current number of items in the queue.
   * The length represents the size of the queue at the time of invocation and may change as new items are added or consumed.
   *
   * @returns The number of items in the queue.
   */
  public length() {
    return this.items.length;
  }

  /**
   * Returns next item within the queue, or blocks until an item has been put into the queue.
   *
   * If given a timeout, the promise will reject if no item is received after `timeoutSec` seconds.
   * If the timeout is undefined (default), this call will block until an item is available or the queue is closed.
   * If the timeout is 0 and there are no items available then the queue will immediately reject with a TimeoutError.
   *
   * If the queue is flushing, `null` is returned.
   * @param timeoutSec - The timeout in seconds.
   * @returns A result promise.
   */
  public get(timeoutSec?: number): Promise<T | null> {
    if (this.items.length) {
      return Promise.resolve(this.items.get()!);
    }

    if (this.items.length === 0 && this.flushing) {
      return Promise.resolve(null);
    }

    // if the caller doesn't want to wait for an item to be available
    // immediately reject with a Timeout error
    if (timeoutSec === 0) {
      return Promise.reject(new TimeoutError('Timeout getting item from queue.'));
    }

    return new Promise<T | null>((resolve, reject) => {
      this.waiting.push(resolve);

      if (timeoutSec) {
        setTimeout(() => {
          const index = this.waiting.findIndex(r => r === resolve);
          if (index > -1) {
            this.waiting.splice(index, 1);
            const err = new TimeoutError('Timeout getting item from queue.');
            reject(err);
          }
        }, timeoutSec * 1000);
      }
    });
  }

  /**
   * Put an item onto back of the queue.
   * @param item - The item to enqueue.
   * @returns A boolean indicating whether the item was successfully added to the queue.
   */
  public put(item: T): boolean {
    if (this.flushing) {
      this.log.warn('Discarding item because queue is flushing');
      return false;
    } else if (this.waiting.length) {
      this.waiting.shift()!(item);
      return true;
    } else {
      this.items.put(item);
      return true;
    }
  }

  /**
   * Once ended, no further items are added to queue. Consumers will consume remaining items within the queue.
   * The queue is not reusable after calling `end()`.
   * Any consumers waiting for an item receive null.
   */
  public end() {
    this.flushing = true;
    this.waiting.forEach(resolve => resolve(null));
  }

  /**
   * Once cancelled, all items are discarded from the queue, and no further items are added to the queue.
   * The queue is not reusable after calling `cancel()`.
   * Any consumers waiting for an item receive null.
   */
  public cancel() {
    this.flushing = true;
    this.items.clear();
    this.waiting.forEach(resolve => resolve(null));
  }

  /**
   * Process items from the queue using a provided handler function.
   * The function iterates over items in the queue, invoking the handler for each item until the queue is empty and flushing.
   * If the handler throws an error, it will be caught and logged as 'Queue handler exception:', but the iteration will continue.
   * The process function returns a promise that resolves when there are no more items in the queue and the queue is flushing.
   *
   * @param handler - A function that takes an item of type T and returns a Promise<void> after processing the item.
   * @returns A Promise<void> that resolves when the queue is finished processing.
   */
  public async process(handler: (item: T) => Promise<void>) {
    try {
      while (true) {
        const item = await this.get();
        if (item === null) {
          break;
        }
        await handler(item);
      }
    } catch (err) {
      this.log.error('Queue handler exception', err);
    }
  }
}
