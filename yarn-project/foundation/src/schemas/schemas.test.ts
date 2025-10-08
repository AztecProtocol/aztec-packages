import { schemas } from './schemas.js';

describe('schemas', () => {
  describe('Boolean', () => {
    it('accepts a boolean value', () => {
      expect(schemas.Boolean.parse(true)).toEqual(true);
      expect(schemas.Boolean.parse(false)).toEqual(false);
    });

    it('accepts a numeric value', () => {
      expect(schemas.Boolean.parse(1)).toEqual(true);
      expect(schemas.Boolean.parse(0)).toEqual(false);
    });

    it('rejects a non binary numeric value', () => {
      expect(schemas.Boolean.safeParse(2).success).toEqual(false);
    });

    it('accepts string values', () => {
      expect(schemas.Boolean.parse('true')).toEqual(true);
      expect(schemas.Boolean.parse('false')).toEqual(false);
      expect(schemas.Boolean.parse('TRUE')).toEqual(true);
      expect(schemas.Boolean.parse('FALSE')).toEqual(false);
      expect(schemas.Boolean.parse('True')).toEqual(true);
      expect(schemas.Boolean.parse('False')).toEqual(false);
      expect(schemas.Boolean.parse(' true ')).toEqual(true);
      expect(schemas.Boolean.parse(' false ')).toEqual(false);
    });

    it('accepts numeric values as string', () => {
      expect(schemas.Boolean.parse('1')).toEqual(true);
      expect(schemas.Boolean.parse('0')).toEqual(false);
    });

    it('rejects other string values', () => {
      expect(schemas.Boolean.safeParse('falso').success).toEqual(false);
    });

    it('rejects empty strings', () => {
      expect(schemas.Boolean.safeParse('').success).toEqual(false);
    });

    it('handles defaults', () => {
      expect(schemas.Boolean.optional().default(true).parse(undefined)).toEqual(true);
      expect(schemas.Boolean.optional().default(false).parse(undefined)).toEqual(false);
    });
  });
});
