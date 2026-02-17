import { SlotNumber, SlotNumberSchema } from './slot.js';

describe('SlotNumber', () => {
  describe('constructor', () => {
    it('creates a slot from a valid number', () => {
      const slot = SlotNumber(5);
      expect(slot).toBe(5);
    });

    it('creates a slot from zero', () => {
      const slot = SlotNumber(0);
      expect(slot).toBe(0);
    });

    it('throws on negative number', () => {
      expect(() => SlotNumber(-1)).toThrow('SlotNumber must be non-negative');
    });

    it('throws on non-integer', () => {
      expect(() => SlotNumber(1.5)).toThrow('SlotNumber must be an integer');
    });
  });

  describe('fromBigInt', () => {
    it('creates a slot from a valid bigint', () => {
      const slot = SlotNumber.fromBigInt(10n);
      expect(slot).toBe(10);
    });

    it('throws on negative bigint', () => {
      expect(() => SlotNumber.fromBigInt(-1n)).toThrow('SlotNumber must be non-negative');
    });

    it('throws on bigint exceeding MAX_SAFE_INTEGER', () => {
      expect(() => SlotNumber.fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('exceeds MAX_SAFE_INTEGER');
    });
  });

  describe('fromString', () => {
    it('creates a slot from a valid string', () => {
      const slot = SlotNumber.fromString('42');
      expect(slot).toBe(42);
    });

    it('throws on invalid string', () => {
      expect(() => SlotNumber.fromString('not a number')).toThrow('Cannot parse SlotNumber from string');
    });
  });

  describe('isValid', () => {
    it('returns true for valid slots', () => {
      expect(SlotNumber.isValid(0)).toBe(true);
      expect(SlotNumber.isValid(100)).toBe(true);
    });

    it('returns false for negative numbers', () => {
      expect(SlotNumber.isValid(-1)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(SlotNumber.isValid(1.5)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(SlotNumber.isValid('5')).toBe(false);
      expect(SlotNumber.isValid(null)).toBe(false);
      expect(SlotNumber.isValid(undefined)).toBe(false);
    });
  });

  describe('SlotNumberSchema', () => {
    it('parses a number', () => {
      const result = SlotNumberSchema.parse(5);
      expect(result).toBe(5);
    });

    it('parses a string', () => {
      const result = SlotNumberSchema.parse('10');
      expect(result).toBe(10);
    });

    it('parses a bigint', () => {
      const result = SlotNumberSchema.parse(15n);
      expect(result).toBe(15);
    });

    it('rejects negative values', () => {
      expect(() => SlotNumberSchema.parse(-1)).toThrow();
    });

    it('rejects non-integer values', () => {
      expect(() => SlotNumberSchema.parse(1.5)).toThrow();
    });
  });

  describe('type safety', () => {
    it('slot is assignable to number', () => {
      const slot = SlotNumber(5);
      const num: number = slot;
      expect(num).toBe(5);
    });

    it('arithmetic works on slots', () => {
      const slot = SlotNumber(5);
      expect(slot + 1).toBe(6);
      expect(slot * 2).toBe(10);
    });
  });

  describe('ZERO constant', () => {
    it('is equal to zero', () => {
      expect(SlotNumber.ZERO).toBe(0);
    });
  });
});
