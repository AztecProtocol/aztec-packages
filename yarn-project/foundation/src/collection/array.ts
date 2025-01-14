import { type Tuple } from '../serialize/types.js';

/**
 * Pads an array to the target length by appending an element to its end. Throws if target length exceeds the input array length. Does not modify the input array.
 * @param arr - Array with elements to pad.
 * @param elem - Element to use for padding.
 * @param length - Target length.
 * @param errorMsg - Error message to throw if target length exceeds the input array length.
 * @returns A new padded array.
 */
export function padArrayEnd<T, N extends number>(
  arr: T[],
  elem: T,
  length: N,
  errorMsg = 'Array size exceeds target length',
): Tuple<T, N> {
  if (arr.length > length) {
    throw new Error(errorMsg);
  }
  // Since typescript cannot always deduce that something is a tuple, we cast
  return [...arr, ...Array(length - arr.length).fill(elem)] as Tuple<T, N>;
}

/** Removes the right-padding for an array. Does not modify original array. */
export function removeArrayPaddingEnd<T>(arr: T[], isEmpty: (item: T) => boolean): T[] {
  const lastNonEmptyIndex = arr.reduce((last, item, i) => (isEmpty(item) ? last : i), -1);
  return lastNonEmptyIndex === -1 ? [] : arr.slice(0, lastNonEmptyIndex + 1);
}

/**
 * Pads an array to the target length by prepending elements at the beginning. Throws if target length exceeds the input array length. Does not modify the input array.
 * @param arr - Array with elements to pad.
 * @param elem - Element to use for padding.
 * @param length - Target length.
 * @returns A new padded array.
 */
export function padArrayStart<T, N extends number>(arr: T[], elem: T, length: N): Tuple<T, N> {
  if (arr.length > length) {
    throw new Error(`Array size exceeds target length`);
  }
  // Since typescript cannot always deduce that something is a tuple, we cast
  return [...Array(length - arr.length).fill(elem), ...arr] as Tuple<T, N>;
}

/**
 * Returns if an array is composed of empty items.
 * @param arr - Array to check.
 * @returns True if every item in the array isEmpty.
 */
export function isArrayEmpty<T>(arr: T[], isEmpty: (item: T) => boolean): boolean {
  for (const item of arr) {
    if (!isEmpty(item)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the number of non-empty items in an array.
 * @param arr - Array to check.
 * @returns Number of non-empty items in an array.
 */
export function arrayNonEmptyLength<T>(arr: T[], isEmpty: (item: T) => boolean): number {
  return arr.reduce((sum, item) => (isEmpty(item) ? sum : sum + 1), 0);
}

/**
 * Executes the given function n times and returns the results in an array.
 * @param n - How many times to repeat.
 * @param fn - Mapper from index to value.
 * @returns The array with the result from all executions.
 */
export function times<T>(n: number, fn: (i: number) => T): T[] {
  return [...Array(n).keys()].map(i => fn(i));
}

/**
 * Executes the given async function n times and returns the results in an array. Awaits each execution before starting the next one.
 * @param n - How many times to repeat.
 * @param fn - Mapper from index to value.
 * @returns The array with the result from all executions.
 */
export async function timesAsync<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await fn(i));
  }
  return results;
}

/**
 * Returns the serialized size of all non-empty items in an array.
 * @param arr - Array
 * @returns The serialized size in bytes.
 */
export function arraySerializedSizeOfNonEmpty(
  arr: (({ isZero: () => boolean } | { isEmpty: () => boolean }) & { toBuffer: () => Buffer })[],
) {
  return arr
    .filter(x => x && ('isZero' in x ? !x.isZero() : !x.isEmpty()))
    .map(x => x!.toBuffer().length)
    .reduce((a, b) => a + b, 0);
}

/**
 * Removes duplicates from the given array.
 * @param arr - The array.
 * @returns A new array.
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Removes all undefined elements from the array.
 * @param arr - The array.
 * @returns A new array.
 */
export function compactArray<T>(arr: (T | undefined)[]): T[] {
  return arr.filter((x: T | undefined): x is T => x !== undefined);
}

/**
 * Returns whether two arrays are equal. The arrays are equal if they have the same length and all elements are equal.
 */
export function areArraysEqual<T>(a: T[], b: T[], eq: (a: T, b: T) => boolean = (a: T, b: T) => a === b): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!eq(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the element of the array that has the maximum value of the given function.
 * In case of a tie, returns the first element with the maximum value.
 * @param arr - The array.
 * @param fn - The function to get the value to compare.
 */
export function maxBy<T>(arr: T[], fn: (x: T) => number): T | undefined {
  return arr.reduce((max, x) => (fn(x) > fn(max) ? x : max), arr[0]);
}

/** Computes the sum of a numeric array. */
export function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/** Computes the median of a numeric array. Returns undefined if array is empty. */
export function median(arr: number[]) {
  if (arr.length === 0) {
    return undefined;
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Computes the mean of a numeric array. Returns undefined if the array is empty. */
export function mean(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Computes the variance of a numeric array. Returns undefined if there are less than 2 points. */
export function variance(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }
  const avg = mean(values)!;
  const points = values.map(value => value * value + avg * avg - 2 * value * avg);
  return sum(points) / (values.length - 1);
}

/** Computes the standard deviation of a numeric array. Returns undefined if there are less than 2 points. */
export function stdDev(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }
  return Math.sqrt(variance(values)!);
}
