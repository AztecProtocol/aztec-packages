import { safeParsePositiveInteger } from './index.js';

describe('config', () => {
  describe('safeParsePositiveInteger', () => {
    it('should return the parsed value for valid positive integers', () => {
      expect(safeParsePositiveInteger('123')).toBe(123);
      expect(safeParsePositiveInteger('1')).toBe(1);
      expect(safeParsePositiveInteger('999999')).toBe(999999);
    });

    it('should throw an error when no default value is provided for invalid input', () => {
      expect(() => safeParsePositiveInteger('-1')).toThrow('Value must be a positive integer: -1');
      expect(() => safeParsePositiveInteger('abc')).toThrow('Value must be a positive integer: abc');
    });

    it('should throw and error when no default value is provided for invalid input', () => {
      expect(() => safeParsePositiveInteger('-1', 42)).toThrow('Value must be a positive integer: -1');
      expect(() => safeParsePositiveInteger('abc', 42)).toThrow('Value must be a positive integer: abc');
    });

    it('should throw error for non-numeric input', () => {
      expect(() => safeParsePositiveInteger('abc')).toThrow('Value must be a positive integer: abc');
      expect(() => safeParsePositiveInteger('123abc')).toThrow('Value must be a positive integer: 123abc');
      expect(() => safeParsePositiveInteger('abc123')).toThrow('Value must be a positive integer: abc123');
    });

    it('should handle empty string', () => {
      expect(() => safeParsePositiveInteger('')).toThrow('Value must be a positive integer: ');
    });
  });
});
