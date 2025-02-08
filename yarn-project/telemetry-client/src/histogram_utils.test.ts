import { exponentialBuckets, linearBuckets } from './histogram_utils.js';

describe('linearBuckets', () => {
  it.each([[10, 1_000, 5, [10, 208, 406, 604, 802, 1000]]] as const)(
    'should return the expected buckets for a given range',
    (start, end, count, expected) => {
      expect(linearBuckets(start, end, count)).toEqual(expected);
    },
  );
});

describe('exponentialBuckets', () => {
  it.each([[2, 8, [1, 1.19, 1.41, 1.68, 2, 2.38, 2.83, 3.36, 4].map(x => expect.closeTo(x, 2))]] as const)(
    'should return the expected buckets for a given range',
    (scale, count, expected) => {
      expect(exponentialBuckets(scale, count)).toEqual(expected);
    },
  );
});
