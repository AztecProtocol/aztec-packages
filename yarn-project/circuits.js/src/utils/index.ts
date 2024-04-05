import { type IsDefault } from '@aztec/foundation/interfaces';
import { type Tuple } from '@aztec/foundation/serialize';

// Define these utils here as their design is very specific to kernel's accumulated data and not general enough to be put in foundation.

// Returns number of non-default items in an array.
export function countAccumulatedItems<T extends IsDefault>(arr: T[]) {
  return arr.reduce((num, item, i) => {
    if (!item.isDefault()) {
      if (num !== i) {
        throw new Error('Non-default items must be placed continuously from index 0.');
      }
      return num + 1;
    }
    return num;
  }, 0);
}

// Merges two arrays of length N into an array of length N.
export function mergeAccumulatedData<T extends IsDefault, N extends number>(
  _length: N,
  arr0: Tuple<T, N>,
  arr1: Tuple<T, N>,
): Tuple<T, N> {
  const numNonDefaultItems0 = countAccumulatedItems(arr0);
  const numNonDefaultItems1 = countAccumulatedItems(arr1);
  if (numNonDefaultItems0 + numNonDefaultItems1 > arr0.length) {
    throw new Error('Combined non-default items exceeded the maximum allowed.');
  }

  const arr = [...arr0] as Tuple<T, N>;
  arr1.slice(0, numNonDefaultItems1).forEach((item, i) => (arr[i + numNonDefaultItems0] = item));
  return arr;
}

// Combines an array of length N and an array of length M into an array of length N + M.
// All non-default items are aggregated continuously from index 0.
export function concatAccumulatedData<T extends IsDefault, NM extends number, N extends number, M extends number>(
  length: NM,
  arr0: Tuple<T, N>,
  arr1: Tuple<T, M>,
): Tuple<T, NM> {
  const combinedLength = arr0.length + arr1.length;
  if (combinedLength !== length) {
    throw new Error(`Provided length does not match combined length. Expected ${combinedLength}. Got ${length}.`);
  }

  const numNonDefaultItems0 = countAccumulatedItems(arr0);
  const numNonDefaultItems1 = countAccumulatedItems(arr1);
  const arr = [...arr0, ...arr1] as Tuple<T, NM>;
  if (numNonDefaultItems0 < arr0.length) {
    const defaultItem = arr0[numNonDefaultItems0];
    arr1.slice(0, numNonDefaultItems1).forEach((item, i) => {
      arr[i + numNonDefaultItems0] = item;
      arr[arr0.length + i] = defaultItem;
    });
  }
  return arr;
}
