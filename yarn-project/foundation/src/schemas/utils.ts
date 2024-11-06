import { type ZodType, z } from 'zod';

import { isHex, withoutHexPrefix } from '../string/index.js';
import { type ZodFor } from './types.js';

export const hexSchema = z.string().refine(isHex, 'Not a valid hex string').transform(withoutHexPrefix);

export function hexSchemaFor<TClass extends { fromString(str: string): any } | { fromBuffer(buf: Buffer): any }>(
  klazz: TClass,
): ZodType<
  TClass extends { fromString(str: string): infer TInstance } | { fromBuffer(buf: Buffer): infer TInstance }
    ? TInstance
    : never,
  any,
  string
> {
  return 'fromString' in klazz
    ? hexSchema.transform(klazz.fromString.bind(klazz))
    : hexSchema.transform(str => Buffer.from(str, 'hex')).transform(klazz.fromBuffer.bind(klazz));
}

// TODO(palla/schemas): Delete this class once all serialization of the type { type: string, value: string } are removed.
export function maybeStructuredStringSchemaFor<TClass extends { fromString(str: string): any }>(
  name: string,
  klazz: TClass,
  refinement?: (input: string) => boolean,
): ZodFor<TClass extends { fromString(str: string): infer TInstance } ? TInstance : never> {
  const stringSchema = refinement ? z.string().refine(refinement, `Not a valid ${name}`) : z.string();
  return z
    .union([stringSchema, z.object({ type: z.literal(name), value: stringSchema })])
    .transform(input => klazz.fromString(typeof input === 'string' ? input : input.value));
}

export function mapSchema<TKey, TValue>(key: ZodFor<TKey>, value: ZodFor<TValue>): ZodFor<Map<TKey, TValue>> {
  return z.array(z.tuple([key, value])).transform(entries => new Map(entries));
}

export function setSchema<T>(value: ZodFor<T>): ZodFor<Set<T>> {
  return z.array(value).transform(entries => new Set(entries));
}
