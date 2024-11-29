/**
 * An array backed by a persistent store. Can not have any holes in it.
 */
export interface AztecArray<T> {
  /**
   * The size of the array
   */
  length(): Promise<number>;

  /**
   * Pushes values to the end of the array
   * @param vals - The values to push to the end of the array
   * @returns The new length of the array
   */
  push(...vals: T[]): Promise<number>;

  /**
   * Pops a value from the end of the array.
   * @returns The value that was popped, or undefined if the array was empty
   */
  pop(): Promise<T | undefined>;

  /**
   * Gets the value at the given index. Index can be in the range [-length, length - 1).
   * If the index is negative, it will be treated as an offset from the end of the array.
   *
   * @param index - The index to get the value from
   * @returns The value at the given index or undefined if the index is out of bounds
   */
  at(index: number): Promise<T | undefined>;

  /**
   * Updates the value at the given index. Index can be in the range [-length, length - 1).
   * @param index - The index to set the value at
   * @param val - The value to set
   * @returns Whether the value was set
   */
  setAt(index: number, val: T): Promise<boolean>;

  /**
   * Iterates over the array with indexes.
   */
  entries(): AsyncIterableIterator<[number, T]>;

  /**
   * Iterates over the array.
   */
  values(): AsyncIterableIterator<T>;

  /**
   * Iterates over the array.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<T>;
}
