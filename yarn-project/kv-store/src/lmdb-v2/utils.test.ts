import { expect } from 'chai';

import { dedupeSortedArray, findIndexInSortedArray, insertIntoSortedArray, merge, removeAnyOf } from './utils.js';

const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

describe('utils', () => {
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
      expect(arr).to.deep.eq(expected);
    }
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
        expect(arr).to.deep.eq(expected);
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
      expect(findIndexInSortedArray(arr, needle, cmp)).to.eq(expected);
    }
  });
});

describe('insertIntoSortedArray', () => {
  it('inserts into empty array', () => {
    const arr: number[] = [];
    insertIntoSortedArray(arr, 1, cmp);
    expect(arr).to.deep.equal([1]);
  });

  it('inserts at beginning', () => {
    const arr = [2, 3, 4];
    insertIntoSortedArray(arr, 1, cmp);
    expect(arr).to.deep.equal([1, 2, 3, 4]);
  });

  it('inserts at end', () => {
    const arr = [1, 2, 3];
    insertIntoSortedArray(arr, 4, cmp);
    expect(arr).to.deep.equal([1, 2, 3, 4]);
  });

  it('inserts in middle', () => {
    const arr = [1, 3, 5];
    insertIntoSortedArray(arr, 4, cmp);
    expect(arr).to.deep.equal([1, 3, 4, 5]);
  });

  it('handles duplicates', () => {
    const arr = [1, 2, 2, 3];
    insertIntoSortedArray(arr, 2, cmp);
    expect(arr).to.deep.equal([1, 2, 2, 2, 3]);
  });

  it('maintains order with multiple inserts', () => {
    const arr: number[] = [];
    [3, 1, 4, 1, 5, 9, 2, 6].forEach(n => insertIntoSortedArray(arr, n, cmp));
    expect(arr).to.deep.equal([1, 1, 2, 3, 4, 5, 6, 9]);
  });
});

describe('removeAnyOf', () => {
  it('removes single matching value', () => {
    const arr = [1, 2, 3, 4];
    removeAnyOf(arr, [2], cmp);
    expect(arr).to.deep.equal([1, 3, 4]);
  });

  it('removes multiple matching values', () => {
    const arr = [1, 2, 3, 4, 5];
    removeAnyOf(arr, [2, 4], cmp);
    expect(arr).to.deep.equal([1, 3, 5]);
  });

  it('handles empty removal array', () => {
    const arr = [1, 2, 3];
    removeAnyOf(arr, [], cmp);
    expect(arr).to.deep.equal([1, 2, 3]);
  });

  it('handles no matches', () => {
    const arr = [1, 3, 5];
    removeAnyOf(arr, [2, 4], cmp);
    expect(arr).to.deep.equal([1, 3, 5]);
  });

  it('removes duplicates', () => {
    const arr = [1, 2, 2, 2, 3];
    removeAnyOf(arr, [2], cmp);
    expect(arr).to.deep.equal([1, 3]);
  });
});
