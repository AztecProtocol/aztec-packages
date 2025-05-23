import { MAXIMUM_KEY, fromBufferKey, toBufferKey } from 'ordered-binary';

import type { Key } from '../interfaces/common.js';

type Cmp<T> = (a: T, b: T) => -1 | 0 | 1;

export function dedupeSortedArray<T>(arr: T[], cmp: Cmp<T>): void {
  for (let i = 0; i < arr.length; i++) {
    let j = i + 1;
    for (; j < arr.length; j++) {
      const res = cmp(arr[i], arr[j]);
      if (res === 0) {
        continue;
      } else if (res < 0) {
        break;
      } else {
        throw new Error('Array not sorted');
      }
    }

    if (j - i > 1) {
      arr.splice(i + 1, j - i - 1);
    }
  }
}

export function insertIntoSortedArray<T>(arr: T[], item: T, cmp: (a: T, b: T) => number): void {
  let left = 0;
  let right = arr.length;

  while (left < right) {
    const mid = (left + right) >> 1;
    const comparison = cmp(arr[mid], item);

    if (comparison < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  arr.splice(left, 0, item);
}

export function findIndexInSortedArray<T, N>(values: T[], needle: N, cmp: (a: T, b: N) => number): number {
  let start = 0;
  let end = values.length - 1;

  while (start <= end) {
    const mid = start + (((end - start) / 2) | 0);
    const res = cmp(values[mid], needle);
    if (res === 0) {
      return mid;
    } else if (res > 0) {
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }

  return -1;
}

export function findInSortedArray<T, N>(values: T[], needle: N, cmp: (a: T, b: N) => number): T | undefined {
  const idx = findIndexInSortedArray(values, needle, cmp);
  return idx > -1 ? values[idx] : undefined;
}

export function removeAnyOf<T, N>(arr: T[], vals: N[], cmp: (a: T, b: N) => -1 | 0 | 1): void {
  let writeIdx = 0;
  let readIdx = 0;
  let valIdx = 0;

  while (readIdx < arr.length && valIdx < vals.length) {
    const comparison = cmp(arr[readIdx], vals[valIdx]);

    if (comparison < 0) {
      arr[writeIdx++] = arr[readIdx++];
    } else if (comparison > 0) {
      valIdx++;
    } else {
      readIdx++;
    }
  }

  while (readIdx < arr.length) {
    arr[writeIdx++] = arr[readIdx++];
  }

  arr.length = writeIdx;
}

export function removeFromSortedArray<T, N>(arr: T[], val: N, cmp: (a: T, b: N) => -1 | 0 | 1) {
  const idx = findIndexInSortedArray(arr, val, cmp);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
}

export function merge<T>(arr: T[], toInsert: T[], cmp: (a: T, b: T) => -1 | 0 | 1): void {
  const result = new Array<T>(arr.length + toInsert.length);
  let i = 0,
    j = 0,
    k = 0;

  while (i < arr.length && j < toInsert.length) {
    result[k++] = cmp(arr[i], toInsert[j]) <= 0 ? arr[i++] : toInsert[j++];
  }

  while (i < arr.length) {
    result[k++] = arr[i++];
  }
  while (j < toInsert.length) {
    result[k++] = toInsert[j++];
  }

  for (i = 0; i < result.length; i++) {
    arr[i] = result[i];
  }
  arr.length = result.length;
}

export function keyCmp(a: [Uint8Array, Uint8Array[] | null], b: [Uint8Array, Uint8Array[] | null]): -1 | 0 | 1 {
  return Buffer.compare(a[0], b[0]);
}

export function singleKeyCmp(a: [Uint8Array, Uint8Array[] | null], b: Uint8Array): -1 | 0 | 1 {
  return Buffer.compare(a[0], b);
}

export function minKey(prefix: string) {
  return toBufferKey([prefix]);
}

export function maxKey(prefix: string) {
  return toBufferKey([prefix, MAXIMUM_KEY]);
}

export function serializeKey(prefix: string, key: Key): Buffer {
  return toBufferKey([prefix, key]);
}

export function deserializeKey<K extends Key>(prefix: string, key: Uint8Array): K | false {
  const buf = Buffer.from(key);
  const parsed = fromBufferKey(buf);
  if (!Array.isArray(parsed) || parsed[0] !== prefix) {
    return false;
  }
  return parsed[1] as K;
}
