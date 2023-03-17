/**
 * A promise that runs a function in a loop with a polling interval.
 */
export class RunningPromise {
  private running = false;
  private runningPromise = Promise.resolve();
  private interruptPromise = Promise.resolve();
  private interruptResolve = () => {};
  constructor(private fn: () => Promise<void>, private pollingInterval = 10000) {}

  /**
   * Starts the running promise.
   */
  public start() {
    this.running = true;
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));

    const poll = async () => {
      while (this.running) {
        await this.fn();
        await this.interruptableSleep(this.pollingInterval);
      }
    };
    this.runningPromise = poll();
  }

  /**
   * Stops the running promise.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.interruptResolve();
    await this.runningPromise;
  }

  /**
   * Sleeps for a given amount of time, but can be interrupted by calling stop.
   * @param timeInMs - The time to sleep in milliseconds.
   */
  private async interruptableSleep(timeInMs: number): Promise<void> {
    let timeout!: NodeJS.Timeout;
    const sleepPromise = new Promise(resolve => {
      timeout = setTimeout(resolve, timeInMs);
    });
    await Promise.race([sleepPromise, this.interruptPromise]);
    clearTimeout(timeout);
  }

  /**
   * Returns whether the running promise is running.
   * @returns Whether the running promise is running.
   */
  public isRunning(): boolean {
    return this.running;
  }
}
