import { TimeoutError } from '../error/index.js';

/**
 * TimeoutTask class creates an instance for managing and executing a given asynchronous function with a specified timeout duration.
 * The task will be automatically interrupted if it exceeds the given timeout duration, and will throw a custom error message.
 * Additional information such as execution time can be retrieved using getTime method after the task has been executed.
 *
 * @typeparam T - The return type of the asynchronous function to be executed.
 */
export class TimeoutTask<T> {
  private interruptPromise!: Promise<any>;
  private interrupt = () => {};
  private totalTime = 0;

  constructor(private fn: () => Promise<T>, private timeout: number, errorFn: () => any) {
    this.interruptPromise = new Promise<T>((_, reject) => {
      this.interrupt = () => reject(errorFn());
    });
  }

  /**
   * Executes the given function with a specified timeout.
   * If the function takes longer than the timeout, it will be interrupted and an error will be thrown.
   * The total execution time of the function will be stored in the totalTime property.
   *
   * @returns The result of the executed function if completed within the timeout.
   * @throws An error with a message indicating the function was interrupted due to exceeding the specified timeout.
   */
  public async exec() {
    const interruptTimeout = setTimeout(this.interrupt, this.timeout);
    try {
      const start = Date.now();
      const result = await Promise.race<T>([this.fn(), this.interruptPromise]);
      this.totalTime = Date.now() - start;
      return result;
    } finally {
      clearTimeout(interruptTimeout);
    }
  }

  /**
   * Returns the interrupt promise associated with the TimeoutTask instance.
   * The interrupt promise is used internally to reject the task when a timeout occurs.
   * This method can be helpful when debugging or tracking the state of the task.
   *
   * @returns The interrupt promise associated with the task.
   */
  public getInterruptPromise() {
    return this.interruptPromise;
  }

  /**
   * Get the total time spent on the most recent execution of the wrapped function.
   * This method provides the duration from the start to the end of the function execution, whether it completed or timed out.
   *
   * @returns The total time in milliseconds spent on the most recent function execution.
   */
  public getTime() {
    return this.totalTime;
  }
}

export async function executeTimeout<T>(fn: () => Promise<T>, timeout: number, errorOrFnName?: string | (() => any)) {
  const errorFn =
    typeof errorOrFnName === 'function'
      ? errorOrFnName
      : () => new TimeoutError(`Timeout running ${errorOrFnName ?? 'function'} after ${timeout}ms.`);
  const task = new TimeoutTask(fn, timeout, errorFn);
  return await task.exec();
}
