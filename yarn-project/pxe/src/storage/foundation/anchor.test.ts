import { type Anchor, anchored, unanchored } from './anchor.js';

describe('anchor helpers', () => {
  const anchor: Anchor = { blockNumber: 105, blockHash: '0xabc' };

  it('anchored attaches the anchor and does not mutate the input', () => {
    const row = { value: 1 };
    const result = anchored(row, anchor);
    expect(result).toEqual({ value: 1, anchor });
    expect(row).toEqual({ value: 1 });
  });

  it('unanchored returns the row unchanged', () => {
    const row = { value: 2 };
    expect(unanchored(row)).toBe(row);
  });
});
