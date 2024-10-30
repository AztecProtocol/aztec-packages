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
