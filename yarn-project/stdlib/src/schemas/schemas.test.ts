import { ZodError } from 'zod';

import { schemas } from './schemas.js';

describe('schemas', () => {
  describe('bigint', () => {
    it('parses from string', () => {
      expect(schemas.BigInt.parse('123')).toEqual(123n);
    });

    it('parses from number', () => {
      expect(schemas.BigInt.parse(123)).toEqual(123n);
    });

    it('parses from hex string', () => {
      expect(schemas.BigInt.parse('0x123')).toEqual(0x123n);
    });

    it('fails when parsing null', () => {
      expect(() => schemas.BigInt.parse(null)).toThrow(expect.any(ZodError));
    });

    it('fails when parsing undefined', () => {
      expect(() => schemas.BigInt.parse(undefined)).toThrow(expect.any(ZodError));
    });

    it('fails when parsing an object', () => {
      expect(() => schemas.BigInt.parse({ a: 10 })).toThrow(expect.any(ZodError));
    });

    it.skip('fails when parsing text', () => {
      // TODO(palla/schemas): We'd need to regex check all valid bigint inputs
      expect(() => schemas.BigInt.parse('foo')).toThrow(expect.any(ZodError));
    });
  });
});
