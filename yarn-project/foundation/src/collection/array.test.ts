import { compactArray, maxBy, mean, median, removeArrayPaddingEnd, stdDev, times, unique, variance } from './array.js';

describe('times', () => {
  it('should return an array with the result from all executions', () => {
    const result = times(5, i => i * 2);
    expect(result).toEqual([0, 2, 4, 6, 8]);
  });

  it('should return an empty array when n is 0', () => {
    const result = times(0, i => i * 2);
    expect(result).toEqual([]);
  });
});

describe('removeArrayPaddingEnd', () => {
  it('removes padding from the end of the array', () => {
    expect(removeArrayPaddingEnd([0, 1, 2, 0, 3, 4, 0, 0], i => i === 0)).toEqual([0, 1, 2, 0, 3, 4]);
  });

  it('does not change array if no padding', () => {
    expect(removeArrayPaddingEnd([0, 1, 2, 0, 3, 4], i => i === 0)).toEqual([0, 1, 2, 0, 3, 4]);
  });

  it('handles no empty items ', () => {
    expect(removeArrayPaddingEnd([1, 2, 3, 4], i => i === 0)).toEqual([1, 2, 3, 4]);
  });

  it('handles empty array', () => {
    expect(removeArrayPaddingEnd([], i => i === 0)).toEqual([]);
  });

  it('handles array with empty items', () => {
    expect(removeArrayPaddingEnd([0, 0, 0], i => i === 0)).toEqual([]);
  });
});

describe('compactArray', () => {
  it('works as expected', () => {
    expect(compactArray([3, undefined, 4, undefined])).toEqual([3, 4]);
  });

  it('handles an empty array', () => {
    expect(compactArray([])).toEqual([]);
  });

  it('handles an array with just undefineds', () => {
    expect(compactArray([undefined, undefined])).toEqual([]);
  });

  it('handles an array with no undefineds', () => {
    expect(compactArray([2, 3])).toEqual([2, 3]);
  });

  it('does not remove falsey values', () => {
    expect(compactArray([0, null, false, '', [], undefined])).toEqual([0, null, false, '', []]);
  });
});

describe('unique', () => {
  it('works with bigints', () => {
    expect(unique([1n, 2n, 1n])).toEqual([1n, 2n]);
  });
});

describe('maxBy', () => {
  it('returns the max value', () => {
    expect(maxBy([1, 2, 3], x => x)).toEqual(3);
  });

  it('returns the first max value', () => {
    expect(maxBy([{ a: 1 }, { a: 3, b: 1 }, { a: 3, b: 2 }], ({ a }) => a)).toEqual({ a: 3, b: 1 });
  });

  it('returns undefined for an empty array', () => {
    expect(maxBy([], x => x)).toBeUndefined();
  });

  it('applies the mapping function', () => {
    expect(maxBy([1, 2, 3], x => -x)).toEqual(1);
  });
});

describe('mean', () => {
  it('calculates the mean of an array of numbers', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20, 30, 40, 50])).toBe(30);
    expect(mean([-1, 0, 1])).toBe(0);
  });
});

describe('median', () => {
  it('calculates the median of an array of numbers', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
    expect(median([-1, 0, 1])).toBe(0);
  });
});

describe('variance', () => {
  it('calculates the variance of an array of numbers', () => {
    expect(variance([1, 2, 3, 4, 5])).toBe(2.5);
    expect(variance([10, 20, 30, 40, 50])).toBe(250);
    expect(variance([-1, 0, 1])).toBe(2 / 3);
  });
});

describe('stdDev', () => {
  it('calculates the standard deviation of an array of numbers', () => {
    expect(stdDev([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 4);
    expect(stdDev([10, 20, 30, 40, 50])).toBeCloseTo(15.8114, 4);
    expect(stdDev([-1, 0, 1])).toBeCloseTo(0.8165, 4);
  });
});
