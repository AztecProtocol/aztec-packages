import { boundInclusive } from './index.js';

describe('boundInclusive', () => {
  it('returns the value if it is within the bounds', () => {
    expect(boundInclusive(5, 1, 10)).toBe(5);
    expect(boundInclusive(1, 1, 10)).toBe(1);
    expect(boundInclusive(10, 1, 10)).toBe(10);
  });

  it('returns the minimum bound if the value is less than the minimum', () => {
    expect(boundInclusive(0, 1, 10)).toBe(1);
    expect(boundInclusive(-5, 0, 100)).toBe(0);
  });

  it('returns the maximum bound if the value is greater than the maximum', () => {
    expect(boundInclusive(15, 1, 10)).toBe(10);
    expect(boundInclusive(200, 0, 100)).toBe(100);
  });

  it('throws an error if the minimum bound is greater than the maximum bound', () => {
    expect(() => boundInclusive(5, 10, 1)).toThrow('Minimum bound cannot be greater than maximum bound');
    expect(() => boundInclusive(0, 100, 50)).toThrow('Minimum bound cannot be greater than maximum bound');
  });

  it('handles edge cases where min and max are the same', () => {
    expect(boundInclusive(5, 5, 5)).toBe(5);
    expect(boundInclusive(10, 10, 10)).toBe(10);
  });

  it('handles negative bounds correctly', () => {
    expect(boundInclusive(-5, -10, -1)).toBe(-5);
    expect(boundInclusive(-15, -10, -1)).toBe(-10);
    expect(boundInclusive(0, -10, -1)).toBe(-1);
  });
});
