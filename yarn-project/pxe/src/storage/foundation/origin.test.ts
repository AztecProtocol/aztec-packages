import { type Origin, withOrigin, withoutOrigin } from './origin.js';

describe('origin helpers', () => {
  const origin: Origin = { blockNumber: 105, blockHash: '0xabc' };

  it('withOrigin attaches the origin and does not mutate the input', () => {
    const row = { value: 1 };
    const result = withOrigin(row, origin);
    expect(result).toEqual({ value: 1, origin });
    expect(row).toEqual({ value: 1 });
  });

  it('withoutOrigin returns the row unchanged', () => {
    const row = { value: 2 };
    expect(withoutOrigin(row)).toBe(row);
  });
});
