import { type ZodTypeAny, z } from 'zod';

import { mapSchema, setSchema } from '../schemas/utils.js';
import { jsonStringify } from './convert.js';

describe('jsonStringify', () => {
  const test = (value: any, schema: ZodTypeAny) => {
    const json = jsonStringify(value);
    expect(schema.parse(JSON.parse(json))).toEqual(value);
  };

  it('object with primitive types', () => {
    const values = { a: 10, b: 'foo', c: true };
    test(values, z.object({ a: z.number(), b: z.string(), c: z.boolean() }));
  });

  it('object with bigints', () => {
    const values = { a: 10n };
    test(values, z.object({ a: z.coerce.bigint() }));
  });

  it('tuples', () => {
    const values = [10, 'foo', true];
    test(values, z.tuple([z.number(), z.string(), z.boolean()]));
  });

  it('arrays', () => {
    const values = [10, 20, 30];
    test(values, z.array(z.number()));
  });

  it('maps', () => {
    const values = new Map([
      ['a', 10],
      ['b', 20],
    ]);
    test(values, mapSchema(z.string(), z.number()));
  });

  it('sets', () => {
    const values = new Set([10, 20]);
    test(values, setSchema(z.number()));
  });
});
