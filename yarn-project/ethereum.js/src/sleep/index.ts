/**
 * InterruptError is a custom error class that extends the built-in JavaScript Error. It represents an interrupt event
 * in an asynchronous sleep operation by the InterruptableSleep class. When thrown, it signifies that the sleep operation
 * has been interrupted and allows developers to handle such events gracefully.
 */
export class InterruptError extends Error {}

/**
 * The InterruptableSleep class provides an enhanced sleep functionality that can be interrupted before the specified duration has elapsed.
 * It allows you to create sleep instances with specified durations, which can be interrupted by calling the 'interrupt' method on the instance.
 * In case of interruption, it can be configured to throw an 'InterruptError' or continue without throwing any error.
 * This is useful in scenarios where you want to break out of a sleep state based on external conditions or events.
 */
export class InterruptableSleep {
  private interruptResolve: (shouldThrow: boolean) => void = () => {};
  private interruptPromise = new Promise<boolean>(resolve => (this.interruptResolve = resolve));
  private timeouts: NodeJS.Timeout[] = [];

  /**
 * Sleeps for a specified amount of milliseconds and optionally throws an InterruptError if interrupted.
 * The function creates a promise that resolves after the given milliseconds and races it with an interruptPromise.
 * If the sleep is interrupted before the timer is completed, it can either resolve or throw an InterruptError based on the shouldThrow flag.
 *
 * @param ms - The number of milliseconds to sleep.
 * @throws InterruptError when the sleep is interrupted and shouldThrow flag is true.
 */
public async sleep(ms: number) {
    let timeout!: NodeJS.Timeout;
    const promise = new Promise<boolean>(resolve => (timeout = setTimeout(() => resolve(false), ms)));
    this.timeouts.push(timeout);
    const shouldThrow = await Promise.race([promise, this.interruptPromise]);
    clearTimeout(timeout);
    this.timeouts.splice(this.timeouts.indexOf(timeout), 1);
    if (shouldThrow) {
      throw new InterruptError('Interrupted.');
    }
  }

  /**
 * Interrupts the sleep currently in progress by resolving the interruptPromise.
 * If sleepShouldThrow is set to true, it will cause the sleep function to throw an InterruptError.
 * The interrupt method can be called multiple times during the lifetime of the InterruptableSleep instance
 * to interrupt the subsequent sleeps. By default, sleepShouldThrow is false, which means the sleep function
 * will not throw an error when interrupted.
 *
 * @param sleepShouldThrow - Optional flag to determine if the sleep function should throw an InterruptError on interruption. Default value is false.
 */
public interrupt(sleepShouldThrow = false) {
    this.interruptResolve(sleepShouldThrow);
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));
  }
}

/**
 * Sleeps for the specified number of milliseconds before resolving. The sleep can be interrupted using the 'interrupt' method.
 * If interrupted, the sleep will either resolve immediately or throw an InterruptError depending on the value passed to 'interrupt'.
 *
 * @param ms - The number of milliseconds to sleep.
 * @throws {InterruptError} When sleep is interrupted and 'sleepShouldThrow' parameter in 'interrupt' is set to true.
 * @returns A Promise that resolves after the specified number of milliseconds or when interrupted.
 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
