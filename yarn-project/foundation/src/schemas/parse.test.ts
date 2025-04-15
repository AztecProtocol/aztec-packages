import { z } from 'zod';

import { jsonStringify } from '../json-rpc/convert.js';
import { parseWithOptionals } from './parse.js';
import { optional } from './utils.js';

describe('parse', () => {
  it('parses arguments without optionals', async () => {
    await expect(parseWithOptionals([1, 2], z.tuple([z.number(), z.number()]))).resolves.toEqual([1, 2]);
  });

  it('handles providing all optional arguments', async () => {
    const schema = z.tuple([z.number(), z.number().optional(), z.number().optional()]);
    await expect(parseWithOptionals([1, 2, 3], schema)).resolves.toEqual([1, 2, 3]);
  });

  it('handles some missing optional arguments', async () => {
    const schema = z.tuple([z.number(), z.number().optional(), z.number().optional()]);
    await expect(parseWithOptionals([1, 2], schema)).resolves.toEqual([1, 2, undefined]);
  });

  it('handles all missing optional arguments', async () => {
    const schema = z.tuple([z.number(), z.number().optional(), z.number().optional()]);
    await expect(parseWithOptionals([1], schema)).resolves.toEqual([1, undefined, undefined]);
  });

  it('handles no arguments if all optional', async () => {
    const schema = z.tuple([z.number().optional(), z.number().optional(), z.number().optional()]);
    await expect(parseWithOptionals([], schema)).resolves.toEqual([undefined, undefined, undefined]);
  });

  it('fails if a required argument is missing', async () => {
    const schema = z.tuple([z.number(), z.number(), z.number().optional()]);
    await expect(parseWithOptionals([1], schema)).rejects.toThrow();
  });

  it('handles coerced bigint', async () => {
    const schema = z.tuple([z.coerce.bigint()]);
    await expect(parseWithOptionals(['1'], schema)).resolves.toEqual([1n]);
  });

  it('handles coerced optional bigint', async () => {
    const schema = z.tuple([z.coerce.bigint().optional()]);
    await expect(parseWithOptionals(['1'], schema)).resolves.toEqual([1n]);
  });

  it('handles missing coerced optional bigint', async () => {
    const schema = z.tuple([z.coerce.bigint().optional()]);
    await expect(parseWithOptionals([], schema)).resolves.toEqual([undefined]);
  });

  it('fails on missing coerced required bigint', async () => {
    const schema = z.tuple([z.coerce.bigint()]);
    await expect(parseWithOptionals([], schema)).rejects.toThrow();
  });

  it('handles explicit undefined values', async () => {
    const schema = z.tuple([z.number(), optional(z.number())]);
    const parsed = JSON.parse(jsonStringify([3, undefined]));
    await expect(parseWithOptionals(parsed, schema)).resolves.toEqual([3, undefined]);
  });
});
