import { BlockNumber, BlockNumberSchema } from './block_number.js';

describe('BlockNumber', () => {
  describe('constructor', () => {
    it('creates a block number from a valid number', () => {
      const blockNumber = BlockNumber(100);
      expect(blockNumber).toBe(100);
    });

    it('creates a block number from zero', () => {
      const blockNumber = BlockNumber.ZERO;
      expect(blockNumber).toBe(0);
    });

    it('throws on negative number', () => {
      expect(() => BlockNumber(-1)).toThrow('BlockNumber must be non-negative');
    });

    it('throws on non-integer', () => {
      expect(() => BlockNumber(1.5)).toThrow('BlockNumber must be an integer');
    });
  });

  describe('fromBigInt', () => {
    it('creates a block number from a valid bigint', () => {
      const blockNumber = BlockNumber.fromBigInt(1000n);
      expect(blockNumber).toBe(1000);
    });

    it('throws on negative bigint', () => {
      expect(() => BlockNumber.fromBigInt(-1n)).toThrow('BlockNumber must be non-negative');
    });

    it('throws on bigint exceeding MAX_SAFE_INTEGER', () => {
      expect(() => BlockNumber.fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('exceeds MAX_SAFE_INTEGER');
    });
  });

  describe('fromString', () => {
    it('creates a block number from a valid string', () => {
      const blockNumber = BlockNumber.fromString('42');
      expect(blockNumber).toBe(42);
    });

    it('throws on invalid string', () => {
      expect(() => BlockNumber.fromString('not a number')).toThrow('Cannot parse BlockNumber from string');
    });
  });

  describe('isValid', () => {
    it('returns true for valid block numbers', () => {
      expect(BlockNumber.isValid(0)).toBe(true);
      expect(BlockNumber.isValid(100)).toBe(true);
    });

    it('returns false for negative numbers', () => {
      expect(BlockNumber.isValid(-1)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(BlockNumber.isValid(1.5)).toBe(false);
    });

    it('returns false for non-numbers', () => {
      expect(BlockNumber.isValid('5')).toBe(false);
      expect(BlockNumber.isValid(null)).toBe(false);
      expect(BlockNumber.isValid(undefined)).toBe(false);
    });
  });

  describe('BlockNumberSchema', () => {
    it('parses a number', () => {
      const result = BlockNumberSchema.parse(100);
      expect(result).toBe(100);
    });

    it('parses a string', () => {
      const result = BlockNumberSchema.parse('200');
      expect(result).toBe(200);
    });

    it('parses a bigint', () => {
      const result = BlockNumberSchema.parse(300n);
      expect(result).toBe(300);
    });

    it('rejects negative values', () => {
      expect(() => BlockNumberSchema.parse(-1)).toThrow();
    });

    it('rejects non-integer values', () => {
      expect(() => BlockNumberSchema.parse(1.5)).toThrow();
    });
  });

  describe('type safety', () => {
    it('block number is assignable to number', () => {
      const blockNumber = BlockNumber(100);
      const num: number = blockNumber;
      expect(num).toBe(100);
    });

    it('arithmetic works on block numbers', () => {
      const blockNumber = BlockNumber(100);
      expect(blockNumber + 1).toBe(101);
      expect(blockNumber * 2).toBe(200);
    });
  });

  describe('ZERO constant', () => {
    it('is equal to zero', () => {
      expect(BlockNumber.ZERO).toBe(0);
    });
  });
});
