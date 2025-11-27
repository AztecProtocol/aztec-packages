import { EpochNumber, EpochNumberSchema } from './epoch.js';

describe('EpochNumber', () => {
  describe('constructor', () => {
    it('creates an epoch from a valid number', () => {
      const epoch = EpochNumber(5);
      expect(epoch).toBe(5);
    });

    it('creates an epoch from zero', () => {
      const epoch = EpochNumber(0);
      expect(epoch).toBe(0);
    });

    it('throws on negative number', () => {
      expect(() => EpochNumber(-1)).toThrow('EpochNumber must be non-negative');
    });

    it('throws on non-integer', () => {
      expect(() => EpochNumber(1.5)).toThrow('EpochNumber must be an integer');
    });
  });

  describe('fromBigInt', () => {
    it('creates an epoch from a valid bigint', () => {
      const epoch = EpochNumber.fromBigInt(10n);
      expect(epoch).toBe(10);
    });

    it('throws on negative bigint', () => {
      expect(() => EpochNumber.fromBigInt(-1n)).toThrow('EpochNumber must be non-negative');
    });

    it('throws on bigint exceeding MAX_SAFE_INTEGER', () => {
      expect(() => EpochNumber.fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('exceeds MAX_SAFE_INTEGER');
    });
  });

  describe('fromString', () => {
    it('creates an epoch from a valid string', () => {
      const epoch = EpochNumber.fromString('42');
      expect(epoch).toBe(42);
    });

    it('throws on invalid string', () => {
      expect(() => EpochNumber.fromString('not a number')).toThrow('Cannot parse EpochNumber from string');
    });
  });

  describe('isValid', () => {
    it('returns true for valid epochs', () => {
      expect(EpochNumber.isValid(0)).toBe(true);
      expect(EpochNumber.isValid(100)).toBe(true);
    });

    it('returns false for negative numbers', () => {
      expect(EpochNumber.isValid(-1)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(EpochNumber.isValid(1.5)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(EpochNumber.isValid('5')).toBe(false);
      expect(EpochNumber.isValid(null)).toBe(false);
      expect(EpochNumber.isValid(undefined)).toBe(false);
    });
  });

  describe('EpochNumberSchema', () => {
    it('parses a number', () => {
      const result = EpochNumberSchema.parse(5);
      expect(result).toBe(5);
    });

    it('parses a string', () => {
      const result = EpochNumberSchema.parse('10');
      expect(result).toBe(10);
    });

    it('parses a bigint', () => {
      const result = EpochNumberSchema.parse(15n);
      expect(result).toBe(15);
    });

    it('rejects negative values', () => {
      expect(() => EpochNumberSchema.parse(-1)).toThrow();
    });

    it('rejects non-integer values', () => {
      expect(() => EpochNumberSchema.parse(1.5)).toThrow();
    });
  });

  describe('type safety', () => {
    it('epoch is assignable to number', () => {
      const epoch = EpochNumber(5);
      const num: number = epoch;
      expect(num).toBe(5);
    });

    it('arithmetic works on epochs', () => {
      const epoch = EpochNumber(5);
      expect(epoch + 1).toBe(6);
      expect(epoch * 2).toBe(10);
    });
  });

  describe('ZERO constant', () => {
    it('is equal to zero', () => {
      expect(EpochNumber.ZERO).toBe(0);
    });
  });
});
