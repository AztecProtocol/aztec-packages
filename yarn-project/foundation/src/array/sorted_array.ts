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

export function insertIntoSortedArray<T>(arr: T[], item: T, cmp: Cmp<T>, allowDuplicates = true): boolean {
  const index = findInsertionIndexInSortedArray(arr, item, cmp);

  if (!allowDuplicates) {
    // Check element before insertion point (upper bound returns index after equal elements)
    if (index > 0 && cmp(arr[index - 1], item) === 0) {
      return false;
    }
  }

  arr.splice(index, 0, item);
  return true;
}

/**
 * Finds the index where needle would be inserted to maintain sorted order.
 * Returns the count of elements less than or equal to needle.
 */
export function findInsertionIndexInSortedArray<T, N>(values: T[], needle: N, cmp: (a: T, b: N) => number): number {
  let start = 0;
  let end = values.length;

  while (start < end) {
    const mid = start + (((end - start) / 2) | 0);
    const comparison = cmp(values[mid], needle);

    if (comparison <= 0) {
      start = mid + 1;
    } else {
      end = mid;
    }
  }

  return start;
}

export function findIndexInSortedArray<T, N>(values: T[], needle: N, cmp: (a: T, b: N) => number): number {
  let start = 0;
  let end = values.length - 1;

  while (start <= end) {
    const mid = start + (((end - start) / 2) | 0);
    const comparison = cmp(values[mid], needle);

    if (comparison === 0) {
      return mid;
    }

    if (comparison > 0) {
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
