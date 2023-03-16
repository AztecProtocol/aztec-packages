import { MemoryFifo } from './memory_fifo.js';

/**
 * A more specialised fifo queue that enqueues functions to execute. Enqueued functions are executed in serial.
 */
export class SerialQueue {
  private readonly queue = new MemoryFifo<() => Promise<void>>();
  private runningPromise!: Promise<void>;

  /**
   * Starts the promise that executes the functions in the queue.
   */
  public start() {
    this.runningPromise = this.queue.process(fn => fn());
  }

  /**
   * Returns the number of items in the queue.
   * @returns The number of items in the queue.
   */
  public length(): number {
    return this.queue.length();
  }

  /**
   * Cancels the queue.
   * @returns A promise that resolves when the queue is empty.
   */
  public cancel(): Promise<void> {
    this.queue.cancel();
    return this.runningPromise;
  }

  /**
   * Ends the queue (no more items can be added - existing items will be processed).
   * @returns A promise that resolves when the queue is empty.
   */
  public end(): Promise<void> {
    this.queue.end();
    return this.runningPromise;
  }

  /**
   * Enqueues `fn` for execution on the serial queue.
   * @param fn - The function to enqueue.
   * @returns The result of the function after execution.
   */
  public put<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.put(async () => {
        try {
          const res = await fn();
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Awaiting this function ensures the queue is empty before resuming.
   */
  public async syncPoint() {
    await this.put(async () => {});
  }
}
