import { fieldToString, fieldsToStrings } from './backend.js';

describe('field helper functions', () => {
  describe('fieldToString', () => {
    it('converts zero field to "0"', () => {
      const zeroField = new Uint8Array(32).fill(0);
      expect(fieldToString(zeroField)).toBe('0');
    });

    it('converts field with value 1 to "1"', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 1;
      expect(fieldToString(oneField)).toBe('1');
    });

    it('converts field with value 256 to "256"', () => {
      const field = new Uint8Array(32).fill(0);
      field[30] = 1;
      field[31] = 0;
      expect(fieldToString(field)).toBe('256');
    });

    it('converts field with max uint8 in last byte to "255"', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field)).toBe('255');
    });

    it('converts larger values correctly', () => {
      // 0x0100 = 256 in decimal
      const field = new Uint8Array(32).fill(0);
      field[30] = 0x01;
      field[31] = 0x00;
      expect(fieldToString(field)).toBe('256');
    });

    it('handles multi-byte values', () => {
      // 0x010203 = 66051 in decimal
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field)).toBe('66051');
    });

    it('handles large field values', () => {
      // A known value: all bytes set to 1
      const field = new Uint8Array(32).fill(1);
      const result = fieldToString(field);
      // Verify it's a valid decimal string
      expect(result).toMatch(/^\d+$/);
      // Verify the length is reasonable for a 256-bit number
      expect(result.length).toBeGreaterThan(70);
    });

    it('converts to hex with radix 16', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field, 16)).toBe('ff');
    });

    it('converts to hex for multi-byte values', () => {
      // 0x010203
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field, 16)).toBe('10203');
    });

    it('converts to binary with radix 2', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 5;
      expect(fieldToString(field, 2)).toBe('101');
    });
  });

  describe('fieldsToStrings', () => {
    it('converts empty array to empty array', () => {
      expect(fieldsToStrings([])).toEqual([]);
    });

    it('converts single field', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 42;
      expect(fieldsToStrings([oneField])).toEqual(['42']);
    });

    it('converts multiple fields', () => {
      const field1 = new Uint8Array(32).fill(0);
      field1[31] = 1;

      const field2 = new Uint8Array(32).fill(0);
      field2[31] = 2;

      const field3 = new Uint8Array(32).fill(0);
      field3[31] = 3;

      expect(fieldsToStrings([field1, field2, field3])).toEqual(['1', '2', '3']);
    });

    it('preserves order of fields', () => {
      const fields = [10, 20, 30, 40, 50].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields)).toEqual(['10', '20', '30', '40', '50']);
    });

    it('converts to hex with radix 16', () => {
      const fields = [15, 16, 255].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields, 16)).toEqual(['f', '10', 'ff']);
    });
  });
});
