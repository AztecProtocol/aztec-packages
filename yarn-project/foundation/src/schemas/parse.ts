import { z } from 'zod';

import { times } from '../collection/array.js';

/** Parses the given arguments using a tuple from the provided schemas. */
export function parse<T extends [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]>(args: IArguments, ...schemas: T) {
  return z.tuple(schemas).parse(args);
}

/**
 * Parses the given arguments against a tuple, allowing empty for optional items.
 * @dev Zod doesn't like tuplues with optional items. See https://github.com/colinhacks/zod/discussions/949.
 */
export function parseWithOptionals<T extends z.AnyZodTuple>(args: any[], schema: T): T['_output'] {
  const missingCount = schema.items.length - args.length;
  const optionalCount = schema.items.filter(isOptional).length;
  const toParse =
    missingCount > 0 && missingCount <= optionalCount ? args.concat(times(missingCount, () => undefined)) : args;
  return schema.parse(toParse);
}

function isOptional(schema: z.ZodTypeAny) {
  try {
    return schema.isOptional();
  } catch (err) {
    // See https://github.com/colinhacks/zod/issues/1911
    return schema._def.typeName === 'ZodOptional';
  }
}
