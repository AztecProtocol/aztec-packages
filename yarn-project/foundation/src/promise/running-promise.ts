import { InterruptError } from '../error/index.js';
import { type Logger, createLogger } from '../log/pino-logger.js';
import { InterruptibleSleep } from '../sleep/index.js';
import { type PromiseWithResolvers, promiseWithResolvers } from './utils.js';

const EXIT = Symbol.for('RunningPromise.EXIT');

export type ErrorHandler = (err: unknown) => typeof EXIT | void | Promise<typeof EXIT | void>;

export function makeLoggingErrorHandler(
  logger: Logger,
  ...ignoredErrors: (new (...args: any[]) => Error)[]
): ErrorHandler {
  return err => {
    if (err instanceof Error && !ignoredErrors.some(ErrorType => err instanceof ErrorType)) {
      logger.error('Error in running promise', err);
    }
  };
}

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

  public static readonly EXIT: typeof EXIT = EXIT;

  constructor(
    private fn: () => void | Promise<void>,
    private logger = createLogger('running-promise'),
    private pollingIntervalMS = 10000,
    private handleError: ErrorHandler = makeLoggingErrorHandler(logger),
  ) {}

  /**
   * Starts the running promise.
   */
  public start() {
    if (this.running) {
      this.logger.warn(`Attempted to start running promise that was already started`);
      return this;
    }
    this.running = true;

    const poll = async () => {
      while (this.running) {
        const requested = this.requested;
        this.requested = undefined;
        try {
          await this.fn();
        } catch (err) {
          const code = await this.handleError(err);
          if (code === RunningPromise.EXIT) {
            this.logger.warn('Error handler has requested to exit', { err });
            this.running = false;
          }
        }

        // If an immediate run had been requested *before* the function started running, resolve the request.
        if (requested) {
          requested.resolve();
        }

        // If no immediate run was requested, sleep for the polling interval.
        if (this.requested === undefined && this.running) {
          await this.interruptibleSleep.sleep(this.pollingIntervalMS);
        }
      }

      // A trigger that arrived after the final pass started will never be served by any pass, so settle it as
      // failed rather than leaving its caller waiting forever.
      const unserved = this.requested;
      this.requested = undefined;
      unserved?.reject(new InterruptError('RunningPromise stopped before serving trigger'));
    };
    this.runningPromise = poll();
    return this;
  }

  /**
   * Stops the running promise, resolves any pending interruptible sleep,
   * and waits for the currently executing function to complete.
   */
  async stop(): Promise<void> {
    if (!this.running) {
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
   *
   * Resolves only after a complete run of the function that *started after* this call: a run already in flight is
   * allowed to finish first, and the function is then called again. Concurrent callers coalesce onto a single such
   * run. Rejects if the loop stops (via `stop()` or an error handler requesting exit) before that run happens.
   *
   * Calling this from inside the function itself and awaiting the result deadlocks, since the awaited run cannot
   * start until the current one returns. That usage is not supported.
   */
  public async trigger(): Promise<void> {
    if (!this.running) {
      return this.fn();
    }

    let requested = this.requested;
    if (!requested) {
      requested = promiseWithResolvers<void>();
      this.requested = requested;
      this.interruptibleSleep.interrupt();
    }
    await requested.promise;
  }

  /**
   * Updates the polling interval. The new interval will take effect after the next poll.
   * @param pollingIntervalMS The polling interval in milliseconds.
   */
  setPollingIntervalMS(pollingIntervalMS: number) {
    this.pollingIntervalMS = pollingIntervalMS;
  }
}
