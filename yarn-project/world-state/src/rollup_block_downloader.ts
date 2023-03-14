import { RollupSource, Rollup } from '@aztec/data-archiver';
import { MemoryFifo } from './memory_fifo.js';
import { Semaphore } from './semaphore.js';
import { InterruptableSleep } from './sleep.js';

export class RollupBlockDownloader {
  private runningPromise?: Promise<void>;
  private running = false;
  private from = 0;
  private interruptableSleep = new InterruptableSleep();
  private semaphore: Semaphore;
  private queue = new MemoryFifo<Rollup[]>();

  constructor(private rollupProvider: RollupSource, maxQueueSize: number) {
    this.semaphore = new Semaphore(maxQueueSize);
  }

  public start(from = 0) {
    this.from = from;

    if (this.running) {
      this.interruptableSleep.interrupt();
      return;
    }

    this.running = true;

    const fn = async () => {
      while (this.running) {
        try {
          const blocks = await this.rollupProvider.getRollups(this.from, 10);

          if (!blocks.length) {
            await this.interruptableSleep.sleep(10000);
            continue;
          }

          // Blocks if there are maxQueueSize results in the queue, until released after the callback.
          await this.semaphore.acquire();

          this.queue.put(blocks);
          this.from += blocks.length;
        } catch (err) {
          console.log(err);
          await this.interruptableSleep.sleep(10000);
        }
      }
    };

    this.runningPromise = fn();
  }

  public async stop() {
    this.running = false;
    this.interruptableSleep.interrupt();
    this.queue.cancel();
    await this.runningPromise;
  }

  public async getBlocks() {
    const blocks = await this.queue.get();
    if (!blocks) {
      return [];
    }
    this.semaphore.release();
    return blocks;
  }
}
