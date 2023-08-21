import { MemoryFifo, Semaphore } from '@aztec/foundation/fifo';
import { createDebugLogger } from '@aztec/foundation/log';
import { InterruptableSleep } from '@aztec/foundation/sleep';

import { INITIAL_L2_BLOCK_NUM, L2Block, L2BlockSource } from '../index.js';

const log = createDebugLogger('aztec:l2_block_downloader');

/**
 * Downloads L2 blocks from a L2BlockSource.
 * The blocks are stored in a queue and can be retrieved using the getBlocks method.
 * The queue size is limited by the maxQueueSize parameter.
 * The downloader will pause when the queue is full or when the L2BlockSource is out of blocks.
 */
export class L2BlockDownloader {
  private runningPromise?: Promise<void>;
  private running = false;
  private from = 0;
  private interruptableSleep = new InterruptableSleep();
  private semaphore: Semaphore;
  private queue = new MemoryFifo<L2Block[]>();
  private obseverPromise = Promise.resolve(0);
  private observerResolve?: (qty: number) => void = undefined;

  constructor(private l2BlockSource: L2BlockSource, maxQueueSize: number, private pollIntervalMS = 10000) {
    this.semaphore = new Semaphore(maxQueueSize);
    this.obseverPromise = new Promise<number>(resolve => {
      this.observerResolve = resolve;
    });
  }

  /**
   * Starts the downloader.
   * @param from - The block number to start downloading from. Defaults to INITIAL_L2_BLOCK_NUM.
   */
  public start(from = INITIAL_L2_BLOCK_NUM) {
    if (this.running) {
      this.interruptableSleep.interrupt();
      return;
    }
    this.from = from;
    this.running = true;

    const fn = async () => {
      let numBlocks = 0;
      while (this.running) {
        try {
          const blocks = await this.l2BlockSource.getL2Blocks(this.from, 10);

          if (!blocks.length) {
            if (this.observerResolve) {
              this.observerResolve(numBlocks);
            }
            this.obseverPromise = new Promise<number>(resolve => {
              this.observerResolve = resolve;
            });
            numBlocks = 0;
            await this.interruptableSleep.sleep(this.pollIntervalMS);
            continue;
          }

          // Blocks if there are maxQueueSize results in the queue, until released after the callback.
          await this.semaphore.acquire();
          this.queue.put(blocks);
          this.from += blocks.length;
          numBlocks += blocks.length;
        } catch (err) {
          log.error(err);
          await this.interruptableSleep.sleep(this.pollIntervalMS);
        }
      }
    };

    this.runningPromise = fn();
  }

  /**
   * Stops the downloader.
   */
  public async stop() {
    this.running = false;
    this.interruptableSleep.interrupt();
    this.queue.cancel();
    await this.runningPromise;
  }

  /**
   * Gets the next batch of blocks from the queue.
   * @param timeout - optional timeout value to prevent permaanent blocking
   * @returns The next batch of blocks from the queue.
   */
  public async getL2Blocks(timeout: number | undefined) {
    try {
      const blocks = await this.queue.get(timeout);
      if (!blocks) {
        return [];
      }
      this.semaphore.release();
      return blocks;
    } catch (err) {
      // nothing to do
      return [];
    }
  }

  /**
   * Forces an immediate request for blocks.
   * @returns A promise that fulfills once the poll is complete
   */
  public pollImmediate(): Promise<number> {
    const observerPromise = this.obseverPromise;
    this.interruptableSleep.interrupt();
    return observerPromise;
  }
}
