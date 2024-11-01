import { type ZodType, z } from 'zod';

import { isHex, withoutHexPrefix } from '../string/index.js';

export const hexSchema = z.string().refine(isHex, 'Not a valid hex string').transform(withoutHexPrefix);

export function hexSchemaFor<TClass extends { fromString(str: string): any }>(
  klazz: TClass,
): ZodType<TClass extends { fromString(str: string): infer TInstance } ? TInstance : never, any, string> {
  return hexSchema.transform(klazz.fromString);
}

// TODO(palla/schemas): Delete this class once all serialization of the type { type: string, value: string } are removed.
export function maybeStructuredStringSchemaFor<TClass extends { fromString(str: string): any }>(
  name: string,
  klazz: TClass,
  refinement?: (input: string) => boolean,
): ZodType<TClass extends { fromString(str: string): infer TInstance } ? TInstance : never, any, any> {
  const stringSchema = refinement ? z.string().refine(refinement, `Not a valid ${name}`) : z.string();
  return z
    .union([stringSchema, z.object({ type: z.literal(name), value: stringSchema })])
    .transform(input => klazz.fromString(typeof input === 'string' ? input : input.value));
}
