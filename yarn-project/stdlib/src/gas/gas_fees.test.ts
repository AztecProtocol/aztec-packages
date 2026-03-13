import { GasFees } from './gas_fees.js';

/** Helper: ceiling division for bigints, matching the fix's behavior. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

describe('GasFees.mul', () => {
  it('multiplies by an integer number scalar', () => {
    const fees = new GasFees(100n, 200n);
    const result = fees.mul(2);
    expect(result).toEqual(new GasFees(200n, 400n));
  });

  it('multiplies by a bigint scalar', () => {
    const fees = new GasFees(100n, 200n);
    const result = fees.mul(3n);
    expect(result).toEqual(new GasFees(300n, 600n));
  });

  it('multiplies by a non-integer scalar', () => {
    const fees = new GasFees(100n, 200n);
    const result = fees.mul(1.5);
    expect(result).toEqual(new GasFees(150n, 300n));
  });

  it('applies ceiling to non-integer scalar results', () => {
    const fees = new GasFees(1n, 1n);
    const result = fees.mul(1.5);
    // 1 * 1.5 = 1.5, ceil(1.5) = 2
    expect(result).toEqual(new GasFees(2n, 2n));
  });

  it('returns a clone when scalar is 1', () => {
    const fees = new GasFees(100n, 200n);
    const result = fees.mul(1);
    expect(result).toEqual(fees);
    expect(result).not.toBe(fees); // should be a new instance (clone)
  });

  it('preserves precision for values above 2^53 (regression test)', () => {
    const bigValue = 2n ** 64n;
    const fees = new GasFees(bigValue, bigValue);
    const result = fees.mul(1.5);

    // 1.5 = 3/2, so the exact result is ceilDiv(2^64 * 3, 2)
    const expected = ceilDiv(bigValue * 3n, 2n);
    expect(result.feePerDaGas).toEqual(expected);
    expect(result.feePerL2Gas).toEqual(expected);
  });

  it('preserves precision for values near 2^128', () => {
    const bigValue = 2n ** 128n - 1n; // max UInt128
    const fees = new GasFees(bigValue, bigValue);
    const result = fees.mul(1.5);

    const expected = ceilDiv(bigValue * 3n, 2n);
    expect(result.feePerDaGas).toEqual(expected);
    expect(result.feePerL2Gas).toEqual(expected);
  });
});
