import { MemoryFifo } from './memory_fifo.js';

/**
 * Allows the acquiring of up to `size` tokens before calls to acquire block, waiting for a call to release().
 */
export class Semaphore {
  private readonly queue = new MemoryFifo<boolean>();

  constructor(size: number) {
    new Array(size).fill(true).map(() => this.queue.put(true));
  }

  /**
   * Acquires a token from the queue. If no token is available, blocks until a token is released.
   */
  public async acquire() {
    await this.queue.get();
  }

  /**
   * Releases a token back into the queue.
   */
  public release() {
    this.queue.put(true);
  }
}
