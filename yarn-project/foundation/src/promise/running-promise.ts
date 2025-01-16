import { createLogger } from '../log/pino-logger.js';
import { InterruptibleSleep } from '../sleep/index.js';
import { type PromiseWithResolvers, promiseWithResolvers } from './utils.js';

/**
 * RunningPromise is a utility class that helps manage the execution of an asynchronous function
 * at a specified polling interval. It allows starting, stopping, and checking the status of the
 * internally managed promise. The class also supports interrupting the polling process when stopped.
 */
export class RunningPromise {
  private running = false;
  private runningPromise = Promise.resolve();
  private interruptibleSleep = new InterruptibleSleep();
  private requested: PromiseWithResolvers<void> | undefined = undefined;

  constructor(
    private fn: () => void | Promise<void>,
    private logger = createLogger('running-promise'),
    private pollingIntervalMS = 10000,
  ) {}

  /**
   * Starts the running promise.
   */
  public start() {
    if (this.running) {
      this.logger.warn(`Attempted to start running promise that was already started`);
      return;
    }
    this.running = true;

    const poll = async () => {
      while (this.running) {
        const hasRequested = this.requested !== undefined;
        try {
          await this.fn();
        } catch (err) {
          this.logger.error('Error in running promise', err);
        }

        // If an immediate run had been requested *before* the function started running, resolve the request.
        if (hasRequested) {
          this.requested!.resolve();
          this.requested = undefined;
        }

        // If no immediate run was requested, sleep for the polling interval.
        if (this.requested === undefined) {
          await this.interruptibleSleep.sleep(this.pollingIntervalMS);
        }
      }
    };
    this.runningPromise = poll();
  }

  /**
   * Stops the running promise, resolves any pending interruptible sleep,
   * and waits for the currently executing function to complete.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn(`Running promise was not started`);
      return;
    }
    this.running = false;
    this.interruptibleSleep.interrupt();
    await this.runningPromise;
  }

  /**
   * Checks if the running promise is currently active.
   * @returns True if the promise is running.
   */
  public isRunning() {
    return this.running;
  }

  /**
   * Triggers an immediate run of the function, bypassing the polling interval.
   * If the function is currently running, it will be allowed to continue and then called again immediately.
   */
  public async trigger() {
    if (!this.running) {
      return this.fn();
    }

    let requested = this.requested;
    if (!requested) {
      requested = promiseWithResolvers<void>();
      this.requested = requested;
      this.interruptibleSleep.interrupt();
    }
    await requested!.promise;
  }

  /**
   * Updates the polling interval. The new interval will take effect after the next poll.
   * @param pollingIntervalMS The polling interval in milliseconds.
   */
  setPollingIntervalMS(pollingIntervalMS: number) {
    this.pollingIntervalMS = pollingIntervalMS;
  }
}
