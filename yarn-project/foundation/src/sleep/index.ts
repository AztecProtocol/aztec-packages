import { InterruptError } from '../errors/index.js';

/**
 * InterruptableSleep is a utility class that allows you to create an interruptible sleep function.
 * The sleep function can be interrupted at any time by calling the `interrupt` method, which can
 * also specify whether the sleep should throw an error or just return. This is useful when you need
 * to terminate long-running processes or perform cleanup tasks in response to external events.
 *
 * @example
 * const sleeper = new InterruptableSleep();
 *
 * async function longRunningTask() \{
 *   try \{
 *     await sleeper.sleep(3000);
 *     console.log('Task completed after 3 seconds');
 *   \} catch (e) \{
 *     console.log('Task was interrupted');
 *   \}
 * \}
 *
 * setTimeout(() =\> sleeper.interrupt(true), 1500); // Interrupt the sleep after 1.5 seconds
 */
export class InterruptableSleep {
  private interruptResolve: (shouldThrow: boolean) => void = () => {};
  private interruptPromise = new Promise<boolean>(resolve => (this.interruptResolve = resolve));
  private timeouts: NodeJS.Timeout[] = [];

  /**
   * Sleep for a specified amount of time in milliseconds.
   * The sleep function will pause the execution of the current async function
   * for the given time period, allowing other tasks to run before resuming.
   *
   * @param ms - The number of milliseconds to sleep.
   * @returns A Promise that resolves after the specified time has passed.
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
   * Interrupts the current sleep operation and optionally throws an error if specified.
   * By default, when interrupted, the sleep operation will resolve without throwing.
   * If 'sleepShouldThrow' is set to true, the sleep operation will throw an InterruptError instead.
   *
   * @param sleepShouldThrow - A boolean value indicating whether the sleep operation should throw an error when interrupted. Default is false.
   */
  public interrupt(sleepShouldThrow = false) {
    this.interruptResolve(sleepShouldThrow);
    this.interruptPromise = new Promise(resolve => (this.interruptResolve = resolve));
  }
}

/**
 * Puts the current execution context to sleep for a specified duration.
 * This simulates a blocking sleep operation by using an asynchronous function and a Promise that resolves after the given duration.
 * The sleep function can be interrupted by the 'interrupt' method of the InterruptableSleep class.
 *
 * @param ms - The duration in milliseconds for which the sleep operation should last.
 * @returns A Promise that resolves after the specified duration, allowing the use of 'await' to pause execution.
 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
