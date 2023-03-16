/**
 * A class which allows you to sleep for a given number of milliseconds, and interrupt that sleep when necessary.
 */
export class InterruptableSleep {
  private interruptResolve: (shouldThrow: boolean) => void = () => {};
  private interruptPromise = new Promise<boolean>(resolve => (this.interruptResolve = resolve));
  private timeouts: NodeJS.Timeout[] = [];

  /**
   * If awaited, will sleep for the given number of milliseconds or until interrupted.
   * @param ms - The number of milliseconds to sleep for.
   */
  public async sleep(ms: number) {
    let timeout!: NodeJS.Timeout;
    const promise = new Promise<boolean>(resolve => (timeout = setTimeout(() => resolve(false), ms)));
    this.timeouts.push(timeout);
    const shouldThrow = await Promise.race([promise, this.interruptPromise]);
    clearTimeout(timeout);
    this.timeouts.splice(this.timeouts.indexOf(timeout), 1);
    if (shouldThrow) {
      throw new Error('Interrupted.');
    }
  }

  /**
   * Interrupts the sleep function.
   * @param sleepShouldThrow - If true, the sleep function will throw an error if the `interruptPromise` is resolved
   * first.
   */
  public interrupt(sleepShouldThrow = false) {
    this.interruptResolve(sleepShouldThrow);
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));
  }
}

/**
 * Sleeps for the given number of milliseconds.
 * @param ms - The number of milliseconds to sleep for.
 * @returns A promise that resolves after the given number of milliseconds.
 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
