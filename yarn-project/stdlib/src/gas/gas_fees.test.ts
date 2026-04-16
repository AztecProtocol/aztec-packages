import { GasFees } from './gas_fees.js';

/** The old Number()-based multiplication that was replaced. Used to demonstrate precision loss. */
function oldNumberMulCeil(value: bigint, scalar: number): bigint {
  return BigInt(Math.ceil(Number(value) * scalar));
}

describe('GasFees', () => {
  describe('mul with non-integer scalar', () => {
    it('multiplies with ceiling', () => {
      const fees = new GasFees(10, 7);
      const result = fees.mul(1.5);
      expect(result.feePerDaGas).toBe(15n);
      expect(result.feePerL2Gas).toBe(11n); // ceil(7 * 1.5) = ceil(10.5) = 11
    });

    it('returns exact result when non-integer multiplication has no remainder', () => {
      const fees = new GasFees(10, 20);
      const result = fees.mul(1.5);
      expect(result.feePerDaGas).toBe(15n);
      expect(result.feePerL2Gas).toBe(30n);
    });

    it('handles zero fees', () => {
      const fees = new GasFees(0, 0);
      const result = fees.mul(1.5);
      expect(result.feePerDaGas).toBe(0n);
      expect(result.feePerL2Gas).toBe(0n);
    });

    it('preserves precision for values above 2^53 with non-integer scalar', () => {
      // 2^53 + 1 is the first integer not safely representable as Number.
      // Number(2^53 + 1) === 2^53, silently losing the +1.
      const aboveSafeInt = (1n << 53n) + 1n; // 9007199254740993n
      const fees = new GasFees(0, aboveSafeInt);
      const result = fees.mul(1.5);

      // Exact: ceil(9007199254740993 * 1.5) = ceil(13510798882111489.5) = 13510798882111490
      const expected = 13510798882111490n;
      expect(result.feePerL2Gas).toBe(expected);

      // The old Number()-based approach produces a wrong result:
      // Number(9007199254740993n) === 9007199254740992 (lost the +1)
      // ceil(9007199254740992 * 1.5) = 13510798882111488 (off by 2)
      const oldResult = oldNumberMulCeil(aboveSafeInt, 1.5);
      expect(oldResult).not.toBe(expected);
      expect(expected - oldResult).toBe(2n);
    });

    it('preserves precision for values near 2^64 with non-integer scalar', () => {
      // At 2^64, Number() loses ~2^11 = 2048 units of precision.
      const largeValue = (1n << 64n) + 12345n;
      const fees = new GasFees(0, largeValue);
      const result = fees.mul(1.5);

      const expected = (largeValue * 3n + 1n) / 2n;
      expect(result.feePerL2Gas).toBe(expected);

      // The old approach diverges significantly at this magnitude.
      const oldResult = oldNumberMulCeil(largeValue, 1.5);
      const drift = oldResult > expected ? oldResult - expected : expected - oldResult;
      expect(drift > 0n).toBe(true);
    });

    it('preserves precision at uint128 max with non-integer scalar', () => {
      // The protocol caps feePerL2Gas at uint128 max via summedMinFee.
      const uint128Max = (1n << 128n) - 1n;
      const fees = new GasFees(0, uint128Max);
      const result = fees.mul(1.5);

      const trueResult = (uint128Max * 3n + 1n) / 2n;
      const diff = result.feePerL2Gas - trueResult;
      expect(diff >= 0n).toBe(true);
      expect(diff <= 1n).toBe(true);
    });

    it('old Number approach loses significant precision near 2^100', () => {
      // A fee near 2^100.
      // Number() can only represent 53 bits of mantissa, so ~47 bits are lost.
      const largeValue = (1n << 100n) + 123456789012345n;
      const fees = new GasFees(0, largeValue);
      const result = fees.mul(1.5);

      const trueResult = (largeValue * 3n + 1n) / 2n;
      expect(result.feePerL2Gas).toBe(trueResult);

      // The old approach drifts by ~185 trillion units at this magnitude.
      const oldResult = oldNumberMulCeil(largeValue, 1.5);
      const oldDrift = trueResult - oldResult;
      expect(oldDrift > 100_000_000_000_000n).toBe(true);
    });

    it('matches expected results for small values', () => {
      const testCases: [bigint, number, bigint][] = [
        // [value, scalar, expected ceiling]
        [100n, 1.5, 150n],
        [100n, 0.5, 50n],
        [100n, 2.5, 250n],
        [7n, 1.5, 11n], // ceil(10.5) = 11
        [7n, 0.3, 3n], // ceil(2.1) = 3
        [999n, 1.99, 1989n], // ceil(999 * 1.99) = ceil(1988.01) = 1989
        [1_000_000n, 1.5, 1_500_000n],
        [1_000_000_000n, 0.5, 500_000_000n],
        [1_000_000_000_000n, 1.5, 1_500_000_000_000n],
      ];

      for (const [value, scalar, expected] of testCases) {
        const fees = new GasFees(value, value);
        const result = fees.mul(scalar);
        expect(result.feePerDaGas).toBe(expected);
        expect(result.feePerL2Gas).toBe(expected);
      }
    });

    it('avoids false rounding from floating-point imprecision', () => {
      // 100 * 1.1 in IEEE-754 is 110.00000000000001, which Math.ceil rounds to 111.
      // The bigint implementation correctly computes ceil(110.0) = 110.
      const fees = new GasFees(100, 100);
      const result = fees.mul(1.1);
      expect(result.feePerDaGas).toBe(110n);

      // The old approach rounds up due to floating-point artifact.
      expect(oldNumberMulCeil(100n, 1.1)).toBe(111n);
    });

    it('always rounds up (ceiling) for non-integer results', () => {
      // 1 * 1.5 = 1.5 -> ceil = 2
      expect(new GasFees(1, 1).mul(1.5).feePerDaGas).toBe(2n);
      // 3 * 1.5 = 4.5 -> ceil = 5
      expect(new GasFees(3, 3).mul(1.5).feePerDaGas).toBe(5n);
      // 1 * 0.3 = 0.3 -> ceil = 1
      expect(new GasFees(1, 1).mul(0.3).feePerDaGas).toBe(1n);
    });
  });
});
