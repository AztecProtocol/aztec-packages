import { type ZodTypeAny, z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import { mapSchema, setSchema } from '../schemas/utils.js';
import { jsonStringify } from './convert.js';

describe('jsonStringify', () => {
  const test = (value: any, schema: ZodTypeAny) => {
    const json = jsonStringify(value);
    expect(schema.parse(JSON.parse(json))).toEqual(value);
  };

  it('handles object with primitive types', () => {
    const values = { a: 10, b: 'foo', c: true };
    test(values, z.object({ a: z.number(), b: z.string(), c: z.boolean() }));
  });

  it('handles object with bigints', () => {
    const values = { a: 10n };
    test(values, z.object({ a: z.coerce.bigint() }));
  });

  it('handles tuples', () => {
    const values = [10, 'foo', true];
    test(values, z.tuple([z.number(), z.string(), z.boolean()]));
  });

  it('handles arrays', () => {
    const values = [10, 20, 30];
    test(values, z.array(z.number()));
  });

  it('handles maps', () => {
    const values = new Map([
      ['a', 10],
      ['b', 20],
    ]);
    test(values, mapSchema(z.string(), z.number()));
  });

  it('handles sets', () => {
    const values = new Set([10, 20]);
    test(values, setSchema(z.number()));
  });

  it('handles buffers', () => {
    const value = Buffer.from('hello');
    const json = jsonStringify(value);
    expect(json).toEqual('"aGVsbG8="');
    test(value, schemas.Buffer);
  });

  it('handles nullish', () => {
    const values = [null, undefined];
    const json = jsonStringify(values);
    expect(JSON.parse(json)).toEqual([null, null]);
  });
});
