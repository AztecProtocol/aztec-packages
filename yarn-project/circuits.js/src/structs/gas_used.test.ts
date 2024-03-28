import { GasUsed } from './gas_used.js';

describe('gas_used', () => {
  it.each([0n, 1n, 2n, 3n, 42n, 2n ** 32n, 2n ** 64n - 1n])('accepts valid values', value => {
    const gasUsed = new GasUsed(value);
    expect(gasUsed.value).toEqual(BigInt(value));

    const b = gasUsed.toBuffer();
    expect(b).toMatchSnapshot();
    expect(GasUsed.fromBuffer(b)).toEqual(gasUsed);

    expect(gasUsed.toHashPreimage()).toMatchSnapshot();
  });

  it.each([-1n, -2n, -42n])('rejects negative values', value => {
    expect(() => new GasUsed(value)).toThrow();
  });

  it('rejects too large values', () => {
    expect(() => new GasUsed(2n ** 64n)).toThrow();
  });

  it('serde retains value', () => {
    const a = GasUsed.fromBuffer(new GasUsed(42n).toBuffer());
    const b = GasUsed.fromBuffer(new GasUsed(43n).toBuffer());

    expect(a.value).toEqual(42n);
    expect(b.value).toEqual(43n);

    expect(a.equals(a)).toBeTruthy();
    expect(a.equals(b)).toBeFalsy();
  });

  it('random', () => {
    const g = GasUsed.random();
    expect(g.value).toBeLessThanOrEqual(GasUsed.MAX_VALUE);
  });
});
