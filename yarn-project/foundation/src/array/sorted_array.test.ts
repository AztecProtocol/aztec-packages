import {
  dedupeSortedArray,
  findInSortedArray,
  findIndexInSortedArray,
  insertIntoSortedArray,
  merge,
  removeAnyOf,
  removeFromSortedArray,
} from './sorted_array.js';

const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

describe('sorted_array', () => {
  it('removeDuplicatesFromSortedArray', () => {
    const tests = [
      [[1], [1]],
      [[1, 1], [1]],
      [[1, 1, 1], [1]],
      [[1, 1, 1, 1], [1]],
      [
        [1, 1, 2, 3, 4],
        [1, 2, 3, 4],
      ],
      [
        [1, 2, 2, 3, 4],
        [1, 2, 3, 4],
      ],
      [
        [1, 2, 3, 3, 4],
        [1, 2, 3, 4],
      ],
      [
        [1, 2, 3, 4, 4],
        [1, 2, 3, 4],
      ],
      [
        [1, 2, 3, 4, 4, 4],
        [1, 2, 3, 4],
      ],
      [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
      ],
      [[], []],
    ];

    for (const [arr, expected] of tests) {
      dedupeSortedArray(arr, cmp);
      expect(arr).toEqual(expected);
    }
  });

  it('dedupeSortedArray throws error on unsorted array', () => {
    const unsortedArr = [3, 1, 2];
    expect(() => dedupeSortedArray(unsortedArr, cmp)).toThrow('Array not sorted');
  });

  describe('merge', () => {
    it('merges', () => {
      const tests = [
        [
          [1, 4, 5, 9],
          [0, 1, 3, 4, 6, 6, 10],
          [0, 1, 1, 3, 4, 4, 5, 6, 6, 9, 10],
        ],
        [[], [], []],
        [[], [1, 1, 1], [1, 1, 1]],
        [[], [1, 2, 3], [1, 2, 3]],
        [[1, 2, 3], [], [1, 2, 3]],
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 1, 2, 2, 3, 3],
        ],
        [
          [4, 5, 6],
          [1, 2, 3],
          [1, 2, 3, 4, 5, 6],
        ],
        [
          [1, 2, 3],
          [4, 5, 6],
          [1, 2, 3, 4, 5, 6],
        ],
      ];
      for (const [arr, toMerge, expected] of tests) {
        merge(arr, toMerge, cmp);
        expect(arr).toEqual(expected);
      }
    });
  });

  it('binarySearch', () => {
    const tests: [number[], number, number][] = [
      [[], 1, -1],

      [[1], 1, 0],
      [[1], 2, -1],
      [[1], 0, -1],

      [[1, 2], 1, 0],
      [[1, 2], 2, 1],
      [[1, 2], 3, -1],
      [[1, 2], 0, -1],

      [[1, 2, 3], 2, 1],
      [[1, 2, 3], 3, 2],
      [[1, 2, 3], 4, -1],
      [[1, 2, 3], 0, -1],
      [[1, 2, 3], 1, 0],
      [[1, 2, 3], 2, 1],
      [[1, 2, 3], 3, 2],
      [[1, 2, 3], 4, -1],
      [[1, 2, 3], 0, -1],

      [[1, 2, 3, 4], 1, 0],
      [[1, 2, 3, 4], 2, 1],
      [[1, 2, 3, 4], 3, 2],
      [[1, 2, 3, 4], 4, 3],
      [[1, 2, 3, 4], 5, -1],
      [[1, 2, 3, 4], 0, -1],
    ];
    for (const [arr, needle, expected] of tests) {
      expect(findIndexInSortedArray(arr, needle, cmp)).toEqual(expected);
    }
  });

  it('findIndexInSortedArray with duplicates returns any valid occurrence', () => {
    // Binary search doesn't guarantee first occurrence, just any valid occurrence
    const arr = [1, 2, 2, 2, 3];
    const index = findIndexInSortedArray(arr, 2, cmp);
    expect(index).toBeGreaterThanOrEqual(1);
    expect(index).toBeLessThanOrEqual(3);
    expect(arr[index]).toBe(2);
  });

  it('findIndexInSortedArray with duplicates at boundaries', () => {
    // Test duplicates at the beginning - should find any occurrence
    const arr1 = [1, 1, 1, 2, 3];
    const index1 = findIndexInSortedArray(arr1, 1, cmp);
    expect(index1).toBeGreaterThanOrEqual(0);
    expect(index1).toBeLessThanOrEqual(2);
    expect(arr1[index1]).toBe(1);

    // Test duplicates at the end - should find any occurrence
    const arr2 = [1, 2, 3, 3, 3];
    const index2 = findIndexInSortedArray(arr2, 3, cmp);
    expect(index2).toBeGreaterThanOrEqual(2);
    expect(index2).toBeLessThanOrEqual(4);
    expect(arr2[index2]).toBe(3);
  });

  it.each([
    [[], 1, undefined],
    [[1], 1, 1],
    [[1], 2, undefined],
    [[1], 0, undefined],
    [[1, 2], 1, 1],
    [[1, 2], 2, 2],
    [[1, 2], 3, undefined],
    [[1, 2], 0, undefined],
    [[1, 2, 3], 1, 1],
    [[1, 2, 3], 2, 2],
    [[1, 2, 3], 3, 3],
    [[1, 2, 3], 4, undefined],
    [[1, 2, 3], 0, undefined],
    [[1, 2, 3, 4], 1, 1],
    [[1, 2, 3, 4], 2, 2],
    [[1, 2, 3, 4], 3, 3],
    [[1, 2, 3, 4], 4, 4],
    [[1, 2, 3, 4], 5, undefined],
    [[1, 2, 3, 4], 0, undefined],
  ] as [number[], number, number | undefined][])(
    'findInSortedArray(%j, %i) should return %p',
    (arr, needle, expected) => {
      expect(findInSortedArray(arr, needle, cmp)).toEqual(expected);
    },
  );
});

describe('insertIntoSortedArray', () => {
  it('inserts into empty array', () => {
    const arr: number[] = [];
    insertIntoSortedArray(arr, 1, cmp);
    expect(arr).toEqual([1]);
  });

  it('inserts into empty array with allowDuplicates=false', () => {
    const arr: number[] = [];
    insertIntoSortedArray(arr, 1, cmp, false);
    expect(arr).toEqual([1]);
  });

  it('inserts at beginning', () => {
    const arr = [2, 3, 4];
    insertIntoSortedArray(arr, 1, cmp);
    expect(arr).toEqual([1, 2, 3, 4]);
  });

  it('inserts at end', () => {
    const arr = [1, 2, 3];
    insertIntoSortedArray(arr, 4, cmp);
    expect(arr).toEqual([1, 2, 3, 4]);
  });

  it('inserts in middle', () => {
    const arr = [1, 3, 5];
    insertIntoSortedArray(arr, 4, cmp);
    expect(arr).toEqual([1, 3, 4, 5]);
  });

  it('handles duplicates', () => {
    const arr = [1, 2, 2, 3];
    insertIntoSortedArray(arr, 2, cmp);
    expect(arr).toEqual([1, 2, 2, 2, 3]);
  });

  it('avoids inserting duplicates if told so', () => {
    const arr = [1, 2, 3];
    insertIntoSortedArray(arr, 2, cmp, false);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('avoids inserting extra duplicates if told so', () => {
    const arr = [1, 2, 2, 3];
    insertIntoSortedArray(arr, 2, cmp, false);
    expect(arr).toEqual([1, 2, 2, 3]);
  });

  it('maintains order with multiple inserts', () => {
    const arr: number[] = [];
    [3, 1, 4, 1, 5, 9, 2, 6].forEach(n => insertIntoSortedArray(arr, n, cmp));
    expect(arr).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  it('returns true on successful insert', () => {
    const arr = [1, 3, 5];
    const result = insertIntoSortedArray(arr, 4, cmp);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 3, 4, 5]);
  });

  it('returns true when inserting duplicate with allowDuplicates=true', () => {
    const arr = [1, 2, 3];
    const result = insertIntoSortedArray(arr, 2, cmp, true);
    expect(result).toBe(true);
    expect(arr).toEqual([1, 2, 2, 3]);
  });

  it('returns false when rejecting duplicate with allowDuplicates=false', () => {
    const arr = [1, 2, 3];
    const result = insertIntoSortedArray(arr, 2, cmp, false);
    expect(result).toBe(false);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('removeAnyOf', () => {
  it('removes single matching value', () => {
    const arr = [1, 2, 3, 4];
    removeAnyOf(arr, [2], cmp);
    expect(arr).toEqual([1, 3, 4]);
  });

  it('removes multiple matching values', () => {
    const arr = [1, 2, 3, 4, 5];
    removeAnyOf(arr, [2, 4], cmp);
    expect(arr).toEqual([1, 3, 5]);
  });

  it('handles empty removal array', () => {
    const arr = [1, 2, 3];
    removeAnyOf(arr, [], cmp);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('handles empty input array', () => {
    const arr: number[] = [];
    removeAnyOf(arr, [1, 2], cmp);
    expect(arr).toEqual([]);
  });

  it('handles no matches', () => {
    const arr = [1, 3, 5];
    removeAnyOf(arr, [2, 4], cmp);
    expect(arr).toEqual([1, 3, 5]);
  });

  it('removes duplicates', () => {
    const arr = [1, 2, 2, 2, 3];
    removeAnyOf(arr, [2], cmp);
    expect(arr).toEqual([1, 3]);
  });
});

describe('removeFromSortedArray', () => {
  it('removes existing value', () => {
    const arr = [1, 2, 3, 4];
    removeFromSortedArray(arr, 2, cmp);
    expect(arr).toEqual([1, 3, 4]);
  });

  it('removes value from beginning', () => {
    const arr = [1, 2, 3];
    removeFromSortedArray(arr, 1, cmp);
    expect(arr).toEqual([2, 3]);
  });

  it('removes value from end', () => {
    const arr = [1, 2, 3];
    removeFromSortedArray(arr, 3, cmp);
    expect(arr).toEqual([1, 2]);
  });

  it('removes only element', () => {
    const arr = [1];
    removeFromSortedArray(arr, 1, cmp);
    expect(arr).toEqual([]);
  });

  it('handles non-existent value', () => {
    const arr = [1, 2, 3];
    removeFromSortedArray(arr, 4, cmp);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    const arr: number[] = [];
    removeFromSortedArray(arr, 1, cmp);
    expect(arr).toEqual([]);
  });

  it('removes first occurrence of duplicate', () => {
    const arr = [1, 2, 2, 3];
    removeFromSortedArray(arr, 2, cmp);
    expect(arr).toEqual([1, 2, 3]);
  });
});
